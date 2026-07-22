from selenium import webdriver
from selenium.webdriver.common.by import By
import time
import getpass
import tkinter as tk
import sys
from tkinter import simpledialog, messagebox


root = tk.Tk()
root.withdraw()

user_id = simpledialog.askstring("로그인", "아이디 입력")
if user_id is None: 
    messagebox.showinfo("로그인 취소", "로그인을 취소합니다?")
    sys.exit()
user_pw = simpledialog.askstring("로그인", "비번 입력", show='*')
if user_pw is None:
    messagebox.showinfo("로그인 취소", "비밀번호 입력 취소 했습니다.")
    sys.exit()



# user_id = input("아이디: ")
# user_pw = getpass.getpass("비밀번호: ")

#카카오 로그인
driver = webdriver.Chrome()
driver.get("https://accounts.kakao.com/login/?continue=https%3A%2F%2Fwww.daum.net#login")
# 로그인 정보 입력
driver.find_element(By.ID, "loginId--1").send_keys(user_id)
driver.find_element(By.ID, "password--2").send_keys(user_pw)
# 로그인 버튼 클릭
driver.find_element(By.CSS_SELECTOR, ".btn_g.highlight.submit").click()

time.sleep(2)


root = tk.Tk()
root.withdraw()

user_id = simpledialog.askstring("로그인", "아이디 입력")
user_pw = simpledialog.askstring("로그인", "비번 입력", show='*')

#user_id = input("아이디: ")
#user_pw = getpass.getpass("비밀번호: ")
#네이버 로그인
driver.get("https://nid.naver.com/nidlogin.login")
# 로그인 정보 입력
driver.find_element(By.ID, "id").send_keys(user_id)
driver.find_element(By.ID, "pw").send_keys(user_pw)
# 로그인 버튼 클릭
driver.find_element(By.CSS_SELECTOR, ".btn_login_wrap").click()

time.sleep(2)

#피파 로그인
root = tk.Tk()
root.withdraw()

user_id = simpledialog.askstring("로그인", "아이디 입력")
user_pw = simpledialog.askstring("로그인", "비번 입력", show='*')

#user_id = input("아이디 ")
#user_pw = getpass.getpass("비번: ")
driver.get("https://nxlogin.nexon.com/common/login.aspx?redirect=https%3A%2F%2Ffconline.nexon.com%2Fmain%2Findex")

#로그인 정보 입력
driver.find_element(By.ID, "txtNexonID").send_keys(user_id)
driver.find_element(By.ID, "txtPWD").send_keys(user_pw)
#로그인 버튼 클릭
driver.find_element(By.CSS_SELECTOR, ".button01").click()




input("엔터 누르기")



