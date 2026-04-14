export default function PrivacyPage() {
  return (
    <main className="min-h-screen flex flex-col items-center py-16 px-4">
      <div className="w-full max-w-2xl prose prose-sm prose-gray">
        <h1 className="text-2xl font-bold tracking-tight mb-6">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: 12 April 2026</p>

        <section className="space-y-4 text-sm text-gray-700 leading-relaxed">
          <h2 className="text-lg font-semibold text-gray-900">What LeaseCheck does</h2>
          <p>
            LeaseCheck lets you upload a PDF of a rental contract. The app extracts text from
            the PDF and checks it against Flemish tenancy law. It can also translate Dutch
            contract text to English.
          </p>

          <h2 className="text-lg font-semibold text-gray-900">Your uploaded files</h2>
          <p>
            Your PDF is read into server memory, processed, and discarded as soon as the
            response is sent. No files are written to disk. No file contents are stored in any
            database. There is no way for us to retrieve your document after the request
            completes.
          </p>

          <h2 className="text-lg font-semibold text-gray-900">Personal data</h2>
          <p>
            LeaseCheck does not require an account, email address, or any form of
            registration. We do not collect or store personal information from your documents.
          </p>

          <h2 className="text-lg font-semibold text-gray-900">Analytics</h2>
          <p>
            We use Google Analytics to understand general usage patterns (page views, country,
            device type). Google Analytics uses cookies. No data from your uploaded documents
            is sent to Google Analytics. You can opt out by using a browser extension such as{' '}
            <a
              href="https://tools.google.com/dlpage/gaoptout"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              Google&apos;s opt-out plugin
            </a>
            .
          </p>

          <h2 className="text-lg font-semibold text-gray-900">Cookies</h2>
          <p>
            The only cookies on this site are set by Google Analytics. LeaseCheck itself does
            not set any cookies.
          </p>

          <h2 className="text-lg font-semibold text-gray-900">Third parties</h2>
          <p>
            Your PDF text is not sent to any external API or third-party service. All
            extraction and rule checking runs on the server that processes your request. The
            translation feature uses an in-process language model and does not send text
            externally.
          </p>

          <h2 className="text-lg font-semibold text-gray-900">Hosting</h2>
          <p>
            The app is hosted on Vercel. Vercel may log IP addresses and request metadata as
            part of normal infrastructure operations. See{' '}
            <a
              href="https://vercel.com/legal/privacy-policy"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              Vercel&apos;s privacy policy
            </a>{' '}
            for details.
          </p>

        </section>

        <div className="mt-12">
          <a
            href="/"
            className="text-sm text-gray-500 underline underline-offset-2 hover:text-gray-700"
          >
            &larr; Back to LeaseCheck
          </a>
        </div>
      </div>
    </main>
  );
}
