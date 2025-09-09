"use client";

import Link from "next/link";
import { useState } from "react";

export default function GuidePage() {
  const [lang, setLang] = useState<"vn" | "en">("vn");
  return (
    <main className="mx-auto max-w-5xl px-6 py-10 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Guide</h1>
        <div className="text-sm flex items-center gap-2">
          <button onClick={() => setLang("vn")} className={`px-3 py-1 rounded-lg border ${lang==='vn' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-gray-50'}`}>VN</button>
          <button onClick={() => setLang("en")} className={`px-3 py-1 rounded-lg border ${lang==='en' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-gray-50'}`}>EN</button>
        </div>
      </div>
      {lang === 'vn' ? (
        <p className="text-gray-600">Tóm tắt hướng dẫn sử dụng ứng dụng MongoDB Tool. Xem thêm trong README hoặc các tab tương ứng.</p>
      ) : (
        <p className="text-gray-600">A short guide to the MongoDB Tool. See README or in-app sections for details.</p>
      )}

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{lang==='vn' ? 'Management' : 'Management'}</h2>
        <ul className="list-disc pl-5 text-gray-700 space-y-1">
          {lang==='vn' ? (
            <>
              <li>Kết nối qua URI (ví dụ: mongodb://localhost:27017). Nếu có mật khẩu, bật auth và điền authSource (admin).</li>
              <li>Duyệt Database/Collection, xem tài liệu. Lọc đơn giản hoặc JSON nâng cao, phân trang, sắp xếp, projection.</li>
              <li>Tạo/Sửa/Xoá tài liệu với JSON editor. Quản lý Index (list/create/drop).</li>
              <li>Saved Queries: lưu, ghim (pin) 3 gần nhất, tải nhanh chỉ 1 click.</li>
            </>
          ) : (
            <>
              <li>Connect via URI (e.g., mongodb://localhost:27017). If auth required, enable and set authSource (admin).</li>
              <li>Browse DB/Collections; use simple or JSON filter, pagination, sort, projection.</li>
              <li>Create/Edit/Delete documents in a JSON editor. Manage indexes (list/create/drop).</li>
              <li>Saved Queries: save and pin last 3, quick load in one click.</li>
            </>
          )}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Sync</h2>
        <ul className="list-disc pl-5 text-gray-700 space-y-1">
          {lang==='vn' ? (
            <>
              <li>Online Sync: nhập Source/Destination (URI + DB), nhấn Start. Thanh tiến độ %, Cancel/Retry, logs chi tiết.</li>
              <li>Offline Sync: Export ZIP (hiển thị % tải xuống), Import ZIP (hiển thị % tải lên). Cần mongodump/mongorestore trong PATH.</li>
            </>
          ) : (
            <>
              <li>Online Sync: set Source/Destination (URI + DB) and Start. Progress %, Cancel/Retry, detailed logs.</li>
              <li>Offline Sync: Export ZIP (download %), Import ZIP (upload %). Requires mongodump/mongorestore on PATH.</li>
            </>
          )}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Export</h2>
        <ul className="list-disc pl-5 text-gray-700 space-y-1">
          {lang==='vn' ? (
            <>
              <li>Định dạng: Excel/CSV/JSON/PDF. CSV có picker field dạng chips: Enter hoặc dấu phẩy để thêm, kéo-thả để sắp xếp.</li>
              <li>MRU gợi ý field gần đây, nút "Select all fields" lấy từ tài liệu mẫu.</li>
            </>
          ) : (
            <>
              <li>Formats: Excel/CSV/JSON/PDF. CSV has chip-based field picker: Enter or comma to add, drag-sort to reorder.</li>
              <li>MRU suggests recent fields; "Select all fields" uses a sampled document.</li>
            </>
          )}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Analytics</h2>
        <ul className="list-disc pl-5 text-gray-700 space-y-1">
          {lang==='vn' ? (
            <>
              <li>Auto chọn biểu đồ dựa trên dữ liệu mẫu (time series / bar / histogram).</li>
              <li>Bảng thống kê có mini‑bar theo tỉ lệ và cảnh báo màu khi gần ngưỡng cao.</li>
            </>
          ) : (
            <>
              <li>Auto chart selection from sampled data (time series / bar / histogram).</li>
              <li>Table shows proportional mini‑bars with warning color near thresholds.</li>
            </>
          )}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{lang==='vn' ? 'Mẹo / Shortcuts' : 'Tips / Shortcuts'}</h2>
        <ul className="list-disc pl-5 text-gray-700 space-y-1">
          {lang==='vn' ? (
            <>
              <li>Enter trong ô Filter JSON để chạy truy vấn.</li>
              <li>CSV chips: Enter hoặc dấu phẩy để thêm, kéo-thả để sắp xếp.</li>
            </>
          ) : (
            <>
              <li>Press Enter in JSON filter to execute query.</li>
              <li>CSV chips: Enter or comma to add, drag-and-drop to order.</li>
            </>
          )}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{lang==='vn' ? 'Minh hoạ' : 'Illustrations'}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-xl border p-4 bg-white">
            <div className="text-sm text-gray-500 mb-2">{lang==='vn' ? 'Quản lý & Lọc' : 'Management & Filters'}</div>
            <div className="aspect-video rounded-lg bg-gray-100 flex items-center justify-center text-gray-400">Screenshot here</div>
          </div>
          <div className="rounded-xl border p-4 bg-white">
            <div className="text-sm text-gray-500 mb-2">Sync</div>
            <div className="aspect-video rounded-lg bg-gray-100 flex items-center justify-center text-gray-400">Screenshot here</div>
          </div>
        </div>
      </section>

      <div className="pt-4">
        <Link className="text-blue-600 hover:underline" href="/contact">{lang==='vn' ? 'Liên hệ hỗ trợ →' : 'Contact support →'}</Link>
      </div>
    </main>
  );
}
