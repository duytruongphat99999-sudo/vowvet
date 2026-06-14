/**
 * scan-handoff.js — chuyển FILE ảnh quét giữa 2 trang qua IndexedDB.
 *
 * Nav-first scan: launcher / FAB nhét File vào IDB rồi điều hướng NGAY sang /scan/result
 * (POST chạy ở trang đó với loading) thay vì đứng ~20s ở màn trước. Full-page nav giết fetch
 * đang chạy + Blob không sống qua nav trong RAM → IDB là kênh duy nhất giữ Blob full-res
 * (sessionStorage base64 vượt quota với ảnh phone vài MB). One-shot: scanFileTake = get + delete.
 *
 * Static /public → KHÔNG qua build; SW cache-first cho *.js → file MỚI lần đầu cần hard-reload
 * PWA 1 lần để nạp. Mọi caller guard typeof === "function" → IDB lỗi/chưa nạp = fallback luồng cũ.
 */
(function () {
  var DB = "vowvet-scan", STORE = "files", VER = 1;

  function openDb() {
    return new Promise(function (resolve, reject) {
      var r = indexedDB.open(DB, VER);
      r.onupgradeneeded = function () {
        if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE);
      };
      r.onsuccess = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
    });
  }

  // Lưu File theo petId. Resolve khi tx commit (chắc chắn đã ghi xong rồi mới nav).
  window.scanFilePut = function (petId, file) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(file, "pet:" + petId);
        tx.oncomplete = function () { db.close(); resolve(); };
        tx.onerror = function () { db.close(); reject(tx.error); };
        tx.onabort = function () { db.close(); reject(tx.error); };
      });
    });
  };

  // Lấy + xoá (one-shot). Không có → null. Refresh/deep-link sau khi đã lấy = null → empty state.
  window.scanFileTake = function (petId) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, "readwrite");
        var store = tx.objectStore(STORE);
        var key = "pet:" + petId;
        var g = store.get(key);
        g.onsuccess = function () { store.delete(key); resolve(g.result || null); };
        g.onerror = function () { reject(g.error); };
        tx.oncomplete = function () { db.close(); };
      });
    });
  };
})();
