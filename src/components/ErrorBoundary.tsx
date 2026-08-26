import { Component, ErrorInfo, ReactNode } from "react";

type Props = { children: ReactNode };
type State = { failed: boolean };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Renderer error", error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return <main className="fatal-error"><div>
      <p>FC ONLINE LAB</p><h1>화면을 표시하지 못했습니다.</h1>
      <span>앱을 새로 시작해 주세요. 문제가 반복되면 오류가 발생한 작업을 함께 알려주세요.</span>
      <button onClick={() => window.location.reload()}>다시 불러오기</button>
    </div></main>;
  }
}
