import json
import threading
import tkinter as tk
from pathlib import Path
from tkinter import messagebox, scrolledtext

import requests
from selenium import webdriver
from selenium.common.exceptions import TimeoutException
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait


CONFIG_FILE = Path(__file__).with_name("config.json")
API_BASE_URL = "https://open.api.nexon.com/fconline/v1"
REQUEST_TIMEOUT_SECONDS = 10


class FCReportApp:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("FC 온라인 대시보드 & 자동화")
        self.root.geometry("520x620")

        tk.Label(
            root, text="⚽ FC 온라인 대시보드", font=("맑은 고딕", 16, "bold")
        ).pack(pady=10)

        self.entry_api_key = self.create_input("Nexon API Key:", show="*")
        self.entry_nickname = self.create_input("구단주명(닉네임):")
        self.entry_id = self.create_input("넥슨 ID:")
        self.entry_pw = self.create_input("비밀번호:", show="*")
        self.load_config()

        button_frame = tk.Frame(root)
        button_frame.pack(pady=10)
        self.save_button = tk.Button(
            button_frame, text="💾 설정 저장", command=self.save_config, width=12
        )
        self.save_button.pack(side=tk.LEFT, padx=5)
        self.report_button = tk.Button(
            button_frame,
            text="📊 전적 리포트",
            command=self.start_report_thread,
            width=12,
            bg="#4CAF50",
            fg="white",
        )
        self.report_button.pack(side=tk.LEFT, padx=5)
        self.more_report_button = tk.Button(
            button_frame,
            text="➕ 3경기 더 보기",
            command=self.start_more_report_thread,
            width=14,
            state=tk.DISABLED,
        )
        self.more_report_button.pack(side=tk.LEFT, padx=5)
        self.login_button = tk.Button(
            button_frame,
            text="🌐 웹 로그인",
            command=self.start_login_thread,
            width=12,
            bg="#2196F3",
            fg="white",
        )
        self.login_button.pack(side=tk.LEFT, padx=5)

        tk.Label(
            root, text="[실행 로그 및 리포트]", font=("맑은 고딕", 10, "bold")
        ).pack(anchor="w", padx=20, pady=(10, 2))
        self.log_area = scrolledtext.ScrolledText(
            root, width=60, height=15, font=("Consolas", 9)
        )
        self.log_area.pack(padx=20, pady=(0, 15), fill=tk.BOTH, expand=True)
        self.create_context_menu(self.log_area)
        self.bind_macos_shortcuts()

    def create_context_menu(self, widget: tk.Widget) -> None:
        """Entry와 Text 위젯에 복사·붙여넣기 메뉴를 추가한다."""
        menu = tk.Menu(widget, tearoff=0)
        for label, event in (
            ("잘라내기", "<<Cut>>"),
            ("복사", "<<Copy>>"),
            ("붙여넣기", "<<Paste>>"),
        ):
            menu.add_command(label=label, command=lambda e=event: widget.event_generate(e))
        menu.add_separator()
        menu.add_command(label="전체 선택", command=lambda: widget.event_generate("<<SelectAll>>"))

        def show_popup(event: tk.Event) -> None:
            try:
                menu.tk_popup(event.x_root, event.y_root)
            finally:
                menu.grab_release()

        widget.bind("<Button-3>", show_popup)
        widget.bind("<Button-2>", show_popup)  # macOS 트랙패드 대응
        widget.bind("<Control-Button-1>", show_popup)

    def create_input(self, label_text: str, show: str | None = None) -> tk.Entry:
        frame = tk.Frame(self.root)
        frame.pack(fill=tk.X, padx=20, pady=3)
        tk.Label(frame, text=label_text, width=15, anchor="w").pack(side=tk.LEFT)
        entry = tk.Entry(frame, show=show)
        entry.pack(side=tk.RIGHT, expand=True, fill=tk.X)
        self.create_context_menu(entry)
        return entry

    def bind_macos_shortcuts(self) -> None:
        self.root.bind_class("Entry", "<Command-a>", lambda e: e.widget.select_range(0, tk.END))
        for event, virtual_event in (("<Command-c>", "<<Copy>>"), ("<Command-v>", "<<Paste>>"), ("<Command-x>", "<<Cut>>")):
            self.root.bind_class("Entry", event, lambda e, v=virtual_event: e.widget.event_generate(v))
        self.root.bind_class("Text", "<Command-a>", lambda e: e.widget.tag_add("sel", "1.0", "end"))
        for event, virtual_event in (("<Command-c>", "<<Copy>>"), ("<Command-v>", "<<Paste>>")):
            self.root.bind_class("Text", event, lambda e, v=virtual_event: e.widget.event_generate(v))

    # Tkinter는 메인 스레드에서만 조작해야 한다.
    def log(self, message: str) -> None:
        self.root.after(0, self._append_log, message)

    def _append_log(self, message: str) -> None:
        self.log_area.insert(tk.END, f"{message}\n")
        self.log_area.see(tk.END)

    def save_config(self) -> None:
        # API 키와 로그인 정보는 민감 정보이므로 파일에 저장하지 않는다.
        CONFIG_FILE.write_text(
            json.dumps({"nickname": self.entry_nickname.get().strip()}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        messagebox.showinfo("저장 완료", "구단주명만 저장했습니다. API 키와 비밀번호는 저장하지 않습니다.")

    def load_config(self) -> None:
        if not CONFIG_FILE.exists():
            return
        try:
            config = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
            self.entry_nickname.insert(0, config.get("nickname", ""))
        except (OSError, json.JSONDecodeError):
            self.log("⚠️ 설정 파일을 읽을 수 없습니다.")

    def start_report_thread(self) -> None:
        """처음 3경기를 조회하고, 다음 조회 위치를 초기화한다."""
        self.start_report_request(offset=0, clear_previous=True)

    def start_more_report_thread(self) -> None:
        """이미 조회한 경기 다음부터 3경기를 추가 조회한다."""
        self.start_report_request(offset=self.next_match_offset, clear_previous=False)

    def start_report_request(self, offset: int, clear_previous: bool) -> None:
        api_key = self.entry_api_key.get().strip()
        nickname = self.entry_nickname.get().strip()
        if not api_key or not nickname:
            messagebox.showwarning("경고", "API Key와 구단주명을 모두 입력해 주세요.")
            return
        self.report_button.configure(state=tk.DISABLED)
        self.more_report_button.configure(state=tk.DISABLED)
        threading.Thread(
            target=self.fetch_report,
            args=(api_key, nickname, offset, clear_previous),
            daemon=True,
        ).start()

    def fetch_report(
        self, api_key: str, nickname: str, offset: int, clear_previous: bool
    ) -> None:
        match_ids: list[str] = []
        try:
            headers = {"x-nxopen-api-key": api_key}
            self.log(f"🔍 [{nickname}] 님의 OUID 조회 중...")
            response = requests.get(
                f"{API_BASE_URL}/id", headers=headers, params={"nickname": nickname}, timeout=REQUEST_TIMEOUT_SECONDS
            )
            response.raise_for_status()
            ouid = response.json().get("ouid")
            if not ouid:
                self.log("❌ OUID 응답에 값이 없습니다.")
                return
            self.log(f"✅ OUID 발급 완료: {ouid[:10]}...")

            response = requests.get(
                f"{API_BASE_URL}/user/match",
                headers=headers,
                params={"ouid": ouid, "matchtype": 50, "offset": offset, "limit": 3},
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
            response.raise_for_status()
            match_ids = response.json()
            if not match_ids:
                self.log("최근 공식경기 기록이 없습니다.")
                return

            heading = "최근" if clear_previous else "추가"
            self.log(f"===== ⚽ [{nickname}] 님의 {heading} {len(match_ids)}경기 요약 =====")
            for index, match_id in enumerate(match_ids, 1):
                detail = requests.get(
                    f"{API_BASE_URL}/match-detail", headers=headers, params={"matchid": match_id}, timeout=REQUEST_TIMEOUT_SECONDS
                )
                detail.raise_for_status()
                match_info = detail.json().get("matchInfo", [])
                mine = next((item for item in match_info if item.get("ouid") == ouid), None)
                opponent = next((item for item in match_info if item.get("ouid") != ouid), None)
                if not mine or not opponent:
                    self.log(f"[{index}번 경기] 상세 정보를 해석할 수 없습니다.")
                    continue
                my_score = mine.get("shoot", {}).get("goalTotal", 0)
                opponent_score = opponent.get("shoot", {}).get("goalTotal", 0)
                result = mine.get("matchDetail", {}).get("matchResult", "기록 없음")
                self.log(f"[{index}번 경기] {result} | 내 득점: {my_score} vs 상대 득점: {opponent_score}")
        except requests.RequestException as error:
            self.log(f"❌ API 요청 오류: {error}")
        except (ValueError, TypeError) as error:
            self.log(f"❌ API 응답 처리 오류: {error}")
        finally:
            self.root.after(
                0,
                lambda: self.set_report_controls(
                    next_offset=offset + len(match_ids),
                    can_load_more=len(match_ids) == 3,
                ),
            )

    def set_report_controls(self, next_offset: int, can_load_more: bool) -> None:
        self.next_match_offset = next_offset
        self.report_button.configure(state=tk.NORMAL)
        self.more_report_button.configure(
            state=tk.NORMAL if can_load_more else tk.DISABLED
        )

    def start_login_thread(self) -> None:
        nexon_id = self.entry_id.get().strip()
        nexon_pw = self.entry_pw.get().strip()
        if not nexon_id or not nexon_pw:
            messagebox.showwarning("경고", "넥슨 ID와 비밀번호를 입력해 주세요.")
            return
        self.login_button.configure(state=tk.DISABLED)
        threading.Thread(target=self.run_selenium_login, args=(nexon_id, nexon_pw), daemon=True).start()

    def run_selenium_login(self, nexon_id: str, nexon_pw: str) -> None:
        self.log("🌐 브라우저를 실행하고 로그인을 시작합니다...")
        try:
            # Selenium 4.6+의 Selenium Manager가 설치된 Chrome과 맞는 드라이버를 자동 선택한다.
            # webdriver-manager 패키지나 별도 chromedriver 설치는 필요하지 않다.
            driver = webdriver.Chrome()
            driver.get("https://nxlogin.nexon.com/common/login.aspx?redirect=https%3A%2F%2Ffconline.nexon.com%2Fmain%2Findex")
            wait = WebDriverWait(driver, 15)
            wait.until(EC.visibility_of_element_located((By.ID, "txtNexonID"))).send_keys(nexon_id)
            wait.until(EC.visibility_of_element_located((By.ID, "txtPWD"))).send_keys(nexon_pw)
            wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, ".button01"))).click()
            self.log("✅ 로그인 요청을 보냈습니다. CAPTCHA·2단계 인증은 브라우저에서 직접 완료해 주세요.")
            self.log("🌐 로그인 완료 후 브라우저에서 FC 온라인을 계속 이용할 수 있습니다.")
        except TimeoutException:
            self.log("❌ 로그인 페이지 요소를 찾지 못했습니다. 페이지 구조가 변경됐을 수 있습니다.")
        except Exception as error:
            self.log(f"❌ 브라우저 실행 또는 로그인 오류: {error}")
            self.log("💡 Chrome 설치 여부와 인터넷 연결을 확인한 뒤 다시 시도해 주세요.")
        finally:
            self.root.after(0, lambda: self.login_button.configure(state=tk.NORMAL))


if __name__ == "__main__":
    root = tk.Tk()
    FCReportApp(root)
    root.mainloop()
