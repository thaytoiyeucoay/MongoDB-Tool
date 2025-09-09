"use client";

export default function ContactPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10 space-y-8">
      <h1 className="text-2xl font-bold">Contact</h1>
      <p className="text-gray-600">Need help or want to request a feature? Reach out with the details below.</p>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Support checklist</h2>
        <ul className="list-disc pl-5 text-gray-700 space-y-1">
          <li>Steps to reproduce the issue</li>
          <li>Screenshots or screen recordings</li>
          <li>Relevant logs (desktop: <code>logs/app.log</code>)</li>
          <li>MongoDB version and OS information</li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Channels</h2>
        <ul className="list-disc pl-5 text-gray-700 space-y-1">
          <li>GitHub Issues: please include the checklist above</li>
          <li>Email: <a className="text-blue-600 hover:underline" href="mailto:your-team@example.com">your-team@example.com</a></li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Tips</h2>
        <ul className="list-disc pl-5 text-gray-700 space-y-1">
          <li>For Sync errors, verify MongoDB CLI tools are on PATH: <code>mongodump</code>, <code>mongorestore</code>, <code>mongoimport</code>, <code>mongoexport</code>.</li>
          <li>When reporting UI issues, specify the browser and version.</li>
        </ul>
      </section>
    </main>
  );
}
