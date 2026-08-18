import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * حاجز الأخطاء — بدونه أي استثناء أثناء العرض (تاريخ تالف في صف واحد مثلاً)
 * يُفرّغ شجرة React كاملة فتظهر صفحة بيضاء بلا أي وسيلة للخروج أو حتى معرفة
 * السبب. هنا يبقى المستخدم على شاشة مفهومة ومعه زرّان للتعافي.
 *
 * React لا يوفّر مكافئاً لهذا بالدوال — الأصناف هي الطريقة الوحيدة.
 */
interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('خطأ غير معالَج في الواجهة:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-gray-50 p-6 text-center">
        <h1 className="text-base font-bold">حدث خطأ غير متوقع</h1>
        <p className="max-w-md text-[13px] text-gray-500">
          تعذّر عرض هذه الشاشة. بياناتك محفوظة ولم يتأثر شيء في قاعدة البيانات.
        </p>
        <pre
          dir="ltr"
          className="max-w-md overflow-x-auto rounded-md bg-gray-100 px-3 py-2 text-left text-[11px] text-gray-600"
        >
          {error.message}
        </pre>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => window.location.assign('/')}
          >
            العودة للرئيسية
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => this.setState({ error: null })}
          >
            إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }
}
