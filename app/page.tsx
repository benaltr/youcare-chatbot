export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-md text-center">
        <h1 className="text-3xl font-semibold mb-2">YouCare AI</h1>
        <p className="text-gray-600">
          Chat widget demo →{" "}
          <a href="/widget" className="text-blue-600 hover:underline">
            /widget
          </a>
        </p>
      </div>
    </main>
  );
}
