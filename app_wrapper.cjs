"use strict";

import("./server.js").catch((error) => {
  console.error("Portal gagal dijalankan.", error);
  process.exitCode = 1;
});
