import { LoginForm } from '@/components/LoginForm';

export default function LoginPage() {
  return (
    /*
     * items-start on mobile: card anchors to the top so it isn't hidden
     * behind the soft keyboard when an input is focused.
     * sm:items-center: revert to centered on larger screens.
     * py-8 sm:py-12: breathing room above/below the card.
     */
    <div className="min-h-screen flex flex-col items-center justify-start sm:justify-center
                    px-3 sm:px-4 py-8 sm:py-12 bg-gray-50">
      <div className="w-full max-w-md">
        {/* Wordmark */}
        <div className="mb-6 sm:mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Roland Web</h1>
          <p className="text-gray-500 text-sm mt-1">AI Orchestration Platform</p>
        </div>

        {/* Card — tighter padding on mobile, full padding on sm+ */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-6 shadow-sm">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
