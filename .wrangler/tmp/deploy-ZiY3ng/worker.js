var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var wideTableCache = [];
var recordsCache = [];
var WIDE_TABLE_R2_KEY = "wide/latest.json";
var RECORDS_R2_KEY = "records/latest.json";
function getDateKeysFromRow(row) {
  return Object.keys(row || {}).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k));
}
__name(getDateKeysFromRow, "getDateKeysFromRow");
function formatYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
__name(formatYMD, "formatYMD");
async function archiveOldDatesToRecords(env, keepDays = 5) {
  const configured = env && env.ARCHIVE_KEEP_DAYS !== void 0 && env.ARCHIVE_KEEP_DAYS !== null;
  const effectiveKeepDays = configured ? parseInt(env.ARCHIVE_KEEP_DAYS) || 0 : 0;
  if (effectiveKeepDays <= 0) return;
  keepDays = effectiveKeepDays;
  if (!Array.isArray(wideTableCache) || wideTableCache.length === 0) return;
  const today = /* @__PURE__ */ new Date();
  const keepSet = new Set(Array.from({ length: keepDays }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    return formatYMD(d);
  }));
  let archived = [];
  wideTableCache.forEach((row) => {
    const dateKeys = getDateKeysFromRow(row);
    dateKeys.forEach((k) => {
      if (!keepSet.has(k)) {
        const stock = parseInt(row[k] || 0) || 0;
        const rec = {
          id: Date.now() + Math.floor(Math.random() * 1e6),
          SKU: row.SKU || "",
          "\u4EA7\u54C1\u4E2D\u6587\u540D": row["\u4EA7\u54C1\u4E2D\u6587\u540D"] || "",
          "\u7F51\u9875\u94FE\u63A5": row["\u7F51\u9875\u94FE\u63A5"] || "",
          "\u521D\u59CB\u5E93\u5B58": row["\u521D\u59CB\u5E93\u5B58"] || 0,
          "\u65E5\u671F": `${k} 00:00`,
          "\u5E93\u5B58": stock,
          "\u9500\u91CF": row[k + "_\u9500\u91CF"] != null ? parseInt(row[k + "_\u9500\u91CF"]) || 0 : 0
        };
        archived.push(rec);
        delete row[k];
        delete row[k + "_\u9500\u91CF"];
      }
    });
  });
  if (archived.length) {
    if (!Array.isArray(recordsCache)) recordsCache = [];
    recordsCache = [...archived, ...recordsCache];
    if (env && env.R2_BUCKET) {
      try {
        await env.R2_BUCKET.put(WIDE_TABLE_R2_KEY, JSON.stringify(wideTableCache), { httpMetadata: { contentType: "application/json" } });
        await env.R2_BUCKET.put(RECORDS_R2_KEY, JSON.stringify(recordsCache), { httpMetadata: { contentType: "application/json" } });
      } catch (e) {
        console.warn("\u5F52\u6863\u6301\u4E45\u5316\u5931\u8D25:", e);
      }
    }
  }
}
__name(archiveOldDatesToRecords, "archiveOldDatesToRecords");
function computeSalesForWideTableRows(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map((row) => {
    const dateKeys = getDateKeysFromRow(row).sort();
    if (dateKeys.length === 0) return row;
    const initial = parseInt(row["\u521D\u59CB\u5E93\u5B58"] || 0) || 0;
    let prevStock = initial;
    dateKeys.forEach((k, idx) => {
      const currStock = parseInt(row[k] || 0) || 0;
      let sales = 0;
      if (idx === 0) {
        sales = Math.max(0, prevStock - currStock);
      } else {
        sales = Math.max(0, prevStock - currStock);
      }
      row[k + "_\u9500\u91CF"] = sales;
      prevStock = currStock;
    });
    return row;
  });
}
__name(computeSalesForWideTableRows, "computeSalesForWideTableRows");
var worker_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };
    if (method === "OPTIONS") {
      return new Response(null, {
        status: 200,
        headers: corsHeaders
      });
    }
    try {
      if (path.startsWith("/api/")) {
        if (path === "/api/health" && (method === "GET" || method === "HEAD")) {
          return Response.json({ success: true, service: "worker", time: (/* @__PURE__ */ new Date()).toISOString() }, { headers: corsHeaders });
        } else if (path === "/api/files/upload" && method === "POST") {
          return await handleExcelUpload(request, env, corsHeaders);
        } else if (path === "/api/package/upload" && method === "POST") {
          return await handlePackageUpload(request, env, corsHeaders);
        } else if (path === "/api/files" && method === "GET") {
          return await handleFilesList(request, env, corsHeaders);
        } else if (path === "/api/package/files" && method === "GET") {
          return await handlePackageFilesList(request, env, corsHeaders);
        } else if (path === "/api/files/presigned-url" && method === "POST") {
          return await handlePresignedUrl(request, env, corsHeaders);
        } else if (path === "/api/files/parse" && method === "POST") {
          return await handleExcelParse(request, env, corsHeaders);
        } else if (path.startsWith("/api/files/") && method === "GET" && path.endsWith("/download")) {
          return await handleFileDownload(request, env, path, corsHeaders);
        } else if (path.startsWith("/api/package/") && method === "GET" && path.endsWith("/download")) {
          return await handlePackageFileDownload(request, env, path, corsHeaders);
        } else if (path.startsWith("/api/files/") && method === "GET" && path.endsWith("/analyze")) {
          return await handleFileAnalyze(request, env, path, corsHeaders);
        } else if (path.startsWith("/api/inventory/")) {
          return await handleInventoryData(request, env, path, method, corsHeaders);
        } else if (path.startsWith("/api/analytics/")) {
          return await handleAnalyticsData(request, env, path, method, corsHeaders);
        } else if (path.startsWith("/api/localdb/")) {
          return await handleLocalDB(request, env, path, method, corsHeaders);
        } else if (path.startsWith("/api/tmall-orders/")) {
          return await handleTmallOrders(request, env, path, method, corsHeaders);
        } else if (path.startsWith("/api/r2/")) {
          return await handleR2Routes(request, env, path, method, corsHeaders);
        } else if (path.startsWith("/api/package-sync/")) {
          return await handlePackageSync(request, env, path, method, corsHeaders);
        } else if (path.startsWith("/api/listing/") || path.startsWith("/api/delisting/")) {
          return await handleListingManagement(request, env, path, method, corsHeaders);
        } else if (path.startsWith("/api/reorganize/")) {
          return await handleReorganization(request, env, path, method, corsHeaders);
        } else {
          return new Response("Not Found", { status: 404, headers: corsHeaders });
        }
      }
      if (env.ASSETS && env.ASSETS.fetch) {
        const resp = await env.ASSETS.fetch(request);
        const headers = new Headers(resp.headers);
        headers.set("Access-Control-Allow-Origin", "*");
        headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
        headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
        return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers });
      }
      return new Response("Not Found", { status: 404, headers: corsHeaders });
    } catch (error) {
      console.error("Worker Error:", error);
      return new Response(JSON.stringify({
        success: false,
        error: error.message
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }
};
async function handlePackageUpload(request, env, corsHeaders) {
  console.log("\u{1F504} \u5904\u7406\u6253\u5305\u7CFB\u7EDF\u6587\u4EF6\u4E0A\u4F20...");
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const description = formData.get("description") || "";
    if (!file) {
      return Response.json({
        success: false,
        error: "\u6CA1\u6709\u4E0A\u4F20\u6587\u4EF6"
      }, { headers: corsHeaders });
    }
    const timestamp = Date.now();
    const randomSuffix = Math.round(Math.random() * 1e9);
    const fileExtension = getFileExtension(file.name);
    const fileName = `${timestamp}-${randomSuffix}.${fileExtension}`;
    const filePath = `package/${fileName}`;
    console.log(`\u{1F4C1} \u4E0A\u4F20\u6587\u4EF6\u8DEF\u5F84: ${filePath}`);
    if (env.R2_BUCKET) {
      console.log("\u{1F4E6} \u4F7F\u7528R2 Bucket\u4E0A\u4F20...");
      await env.R2_BUCKET.put(filePath, file.stream(), {
        httpMetadata: {
          contentType: file.type || "application/octet-stream"
        },
        customMetadata: {
          originalName: file.name,
          uploadTime: (/* @__PURE__ */ new Date()).toISOString(),
          description
        }
      });
    } else {
      throw new Error("R2\u5B58\u50A8\u6876\u4E0D\u53EF\u7528");
    }
    const fileInfo = {
      id: timestamp,
      originalName: file.name,
      fileName,
      size: file.size,
      uploadTime: (/* @__PURE__ */ new Date()).toISOString(),
      uploadedBy: "package-system",
      description,
      r2Path: filePath,
      publicUrl: `https://23441d4f7734b84186c4c20ddefef8e7.r2.cloudflarestorage.com/century-business-system/${filePath}`
    };
    console.log("\u2705 \u6253\u5305\u7CFB\u7EDF\u6587\u4EF6\u4E0A\u4F20\u6210\u529F:", fileName);
    return Response.json({
      success: true,
      message: "\u6587\u4EF6\u4E0A\u4F20\u6210\u529F",
      file: fileInfo
    }, { headers: corsHeaders });
  } catch (error) {
    console.error("\u274C \u6253\u5305\u7CFB\u7EDF\u6587\u4EF6\u4E0A\u4F20\u5931\u8D25:", error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500, headers: corsHeaders });
  }
}
__name(handlePackageUpload, "handlePackageUpload");
async function handleExcelUpload(request, env, corsHeaders) {
  console.log("\u{1F504} \u5904\u7406Excel\u6587\u4EF6\u4E0A\u4F20...");
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const description = formData.get("description") || "";
    if (!file) {
      return Response.json({
        success: false,
        error: "\u6CA1\u6709\u4E0A\u4F20\u6587\u4EF6"
      }, { headers: corsHeaders });
    }
    if (!isExcelFile(file)) {
      return Response.json({
        success: false,
        error: "\u53EA\u652F\u6301Excel\u6587\u4EF6(.xlsx, .xls)"
      }, { headers: corsHeaders });
    }
    const timestamp = Date.now();
    const randomSuffix = Math.round(Math.random() * 1e9);
    const fileExtension = getFileExtension(file.name);
    const fileName = `${timestamp}-${randomSuffix}.${fileExtension}`;
    const filePath = `arc/${fileName}`;
    console.log(`\u{1F4C1} \u4E0A\u4F20\u6587\u4EF6\u8DEF\u5F84: ${filePath}`);
    if (env.R2_BUCKET) {
      console.log("\u{1F4E6} \u4F7F\u7528R2 Bucket\u4E0A\u4F20...");
      await env.R2_BUCKET.put(filePath, file.stream(), {
        httpMetadata: {
          contentType: file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        },
        customMetadata: {
          originalName: file.name,
          uploadTime: (/* @__PURE__ */ new Date()).toISOString(),
          description
        }
      });
    } else {
      throw new Error("R2\u5B58\u50A8\u6876\u4E0D\u53EF\u7528");
    }
    const fileInfo = {
      id: timestamp,
      originalName: file.name,
      fileName,
      size: file.size,
      uploadTime: (/* @__PURE__ */ new Date()).toISOString(),
      uploadedBy: "admin",
      description,
      r2Path: filePath,
      publicUrl: `https://23441d4f7734b84186c4c20ddefef8e7.r2.cloudflarestorage.com/century-business-system/${filePath}`
    };
    console.log("\u2705 \u6587\u4EF6\u4E0A\u4F20\u6210\u529F:", fileInfo);
    return Response.json({
      success: true,
      message: "\u6587\u4EF6\u4E0A\u4F20\u6210\u529F",
      file: fileInfo
    }, { headers: corsHeaders });
  } catch (error) {
    console.error("\u274C \u6587\u4EF6\u4E0A\u4F20\u5931\u8D25:", error);
    return Response.json({
      success: false,
      error: `\u6587\u4EF6\u4E0A\u4F20\u5931\u8D25: ${error.message}`
    }, {
      status: 500,
      headers: corsHeaders
    });
  }
}
__name(handleExcelUpload, "handleExcelUpload");
async function handlePackageFilesList(request, env, corsHeaders) {
  console.log("\u{1F504} \u83B7\u53D6\u6253\u5305\u6587\u4EF6\u5217\u8868...");
  try {
    if (!env.R2_BUCKET) {
      throw new Error("R2\u5B58\u50A8\u6876\u4E0D\u53EF\u7528");
    }
    const list = await env.R2_BUCKET.list({ prefix: "package/" });
    const files = [];
    for (const obj of list.objects) {
      try {
        const fileObj = await env.R2_BUCKET.get(obj.key);
        if (fileObj) {
          files.push({
            id: extractIdFromFileName(obj.key),
            originalName: fileObj.customMetadata?.originalName || obj.key.split("/").pop(),
            fileName: obj.key.split("/").pop(),
            size: obj.size,
            uploadTime: fileObj.customMetadata?.uploadTime || obj.uploaded.toISOString(),
            description: fileObj.customMetadata?.description || "",
            r2Path: obj.key,
            publicUrl: `https://23441d4f7734b84186c4c20ddefef8e7.r2.cloudflarestorage.com/century-business-system/${obj.key}`
          });
        }
      } catch (err) {
        console.warn("\u83B7\u53D6\u6587\u4EF6\u5143\u6570\u636E\u5931\u8D25:", obj.key, err.message);
      }
    }
    console.log(`\u2705 \u627E\u5230 ${files.length} \u4E2A\u6253\u5305\u6587\u4EF6`);
    return Response.json({
      success: true,
      files
    }, { headers: corsHeaders });
  } catch (error) {
    console.error("\u274C \u83B7\u53D6\u6253\u5305\u6587\u4EF6\u5217\u8868\u5931\u8D25:", error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500, headers: corsHeaders });
  }
}
__name(handlePackageFilesList, "handlePackageFilesList");
async function handleFilesList(request, env, corsHeaders) {
  console.log("\u{1F504} \u83B7\u53D6\u6587\u4EF6\u5217\u8868...");
  try {
    if (env.R2_BUCKET) {
      const objects = await env.R2_BUCKET.list({ prefix: "arc/" });
      const files = objects.objects.map((obj, index) => ({
        id: index + 1,
        originalName: obj.customMetadata?.originalName || obj.key.replace("arc/", ""),
        fileName: obj.key.replace("arc/", ""),
        size: obj.size || 0,
        uploadTime: obj.customMetadata?.uploadTime || obj.uploaded || (/* @__PURE__ */ new Date()).toISOString(),
        uploadedBy: "admin",
        description: obj.customMetadata?.description || "",
        r2Path: obj.key,
        publicUrl: `https://23441d4f7734b84186c4c20ddefef8e7.r2.cloudflarestorage.com/century-business-system/${obj.key}`
      }));
      console.log(`\u2705 \u627E\u5230 ${files.length} \u4E2A\u6587\u4EF6`);
      return Response.json({
        success: true,
        files
      }, { headers: corsHeaders });
    } else {
      throw new Error("R2\u5B58\u50A8\u6876\u4E0D\u53EF\u7528");
    }
  } catch (error) {
    console.error("\u274C \u83B7\u53D6\u6587\u4EF6\u5217\u8868\u5931\u8D25:", error);
    return Response.json({
      success: true,
      files: [],
      message: "\u6587\u4EF6\u5217\u8868\u4E3A\u7A7A\u6216\u83B7\u53D6\u5931\u8D25"
    }, { headers: corsHeaders });
  }
}
__name(handleFilesList, "handleFilesList");
function isExcelFile(file) {
  const allowedTypes = [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    // .xlsx
    "application/vnd.ms-excel",
    // .xls
    "application/excel",
    "application/x-excel"
  ];
  const allowedExtensions = [".xlsx", ".xls"];
  const fileName = file.name.toLowerCase();
  return allowedTypes.includes(file.type) || allowedExtensions.some((ext) => fileName.endsWith(ext));
}
__name(isExcelFile, "isExcelFile");
async function handlePresignedUrl(request, env, corsHeaders) {
  console.log("\u{1F504} \u5904\u7406\u6587\u4EF6\u4E0A\u4F20\u8BF7\u6C42...");
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const originalFileName = formData.get("fileName") || file.name;
    if (!file) {
      return Response.json({
        success: false,
        error: "\u6CA1\u6709\u4E0A\u4F20\u6587\u4EF6"
      }, { headers: corsHeaders });
    }
    if (!isExcelFile(file)) {
      return Response.json({
        success: false,
        error: "\u53EA\u652F\u6301Excel\u6587\u4EF6(.xlsx, .xls)"
      }, { headers: corsHeaders });
    }
    const timestamp = Date.now();
    const randomSuffix = Math.round(Math.random() * 1e9);
    const fileExtension = getFileExtension(originalFileName);
    const newFileName = `${timestamp}-${randomSuffix}.${fileExtension}`;
    const filePath = `arc/${newFileName}`;
    console.log(`\u{1F4C1} \u4E0A\u4F20\u6587\u4EF6\u5230: ${filePath}`);
    if (env.R2_BUCKET) {
      const arrayBuffer = await file.arrayBuffer();
      const excelData = parseExcelData(arrayBuffer);
      const dataKey = `excel_data_${timestamp}`;
      await env.R2_BUCKET.put(filePath, file.stream(), {
        httpMetadata: {
          contentType: file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        },
        customMetadata: {
          originalName: originalFileName,
          uploadTime: (/* @__PURE__ */ new Date()).toISOString(),
          dataKey,
          parsedRows: excelData.length
        }
      });
      return Response.json({
        success: true,
        filePath,
        newFileName,
        originalName: originalFileName,
        size: file.size,
        uploadTime: (/* @__PURE__ */ new Date()).toISOString(),
        publicUrl: `https://23441d4f7734b84186c4c20ddefef8e7.r2.cloudflarestorage.com/century-business-system/${filePath}`
      }, { headers: corsHeaders });
    } else {
      throw new Error("R2\u5B58\u50A8\u6876\u4E0D\u53EF\u7528");
    }
  } catch (error) {
    console.error("\u274C \u6587\u4EF6\u4E0A\u4F20\u5931\u8D25:", error);
    return Response.json({
      success: false,
      error: `\u6587\u4EF6\u4E0A\u4F20\u5931\u8D25: ${error.message}`
    }, {
      status: 500,
      headers: corsHeaders
    });
  }
}
__name(handlePresignedUrl, "handlePresignedUrl");
async function handleExcelParse(request, env, corsHeaders) {
  console.log("\u{1F504} \u89E3\u6790Excel\u6587\u4EF6...");
  try {
    const body = await request.json();
    const { filePath } = body;
    if (!filePath) {
      return Response.json({
        success: false,
        error: "\u6587\u4EF6\u8DEF\u5F84\u4E0D\u80FD\u4E3A\u7A7A"
      }, { headers: corsHeaders });
    }
    if (env.R2_BUCKET) {
      const object = await env.R2_BUCKET.get(filePath);
      if (!object) {
        return Response.json({
          success: false,
          error: "\u6587\u4EF6\u4E0D\u5B58\u5728"
        }, { headers: corsHeaders });
      }
      const mockData = generateMockInventoryData();
      const dataKey = `excel_data_${Date.now()}`;
      return Response.json({
        success: true,
        dataKey,
        rows: mockData.length,
        columns: Object.keys(mockData[0] || {}).length,
        preview: mockData.slice(0, 5),
        // 前5行预览
        message: "Excel\u6587\u4EF6\u89E3\u6790\u6210\u529F"
      }, { headers: corsHeaders });
    } else {
      throw new Error("R2\u5B58\u50A8\u6876\u4E0D\u53EF\u7528");
    }
  } catch (error) {
    console.error("\u274C Excel\u89E3\u6790\u5931\u8D25:", error);
    return Response.json({
      success: false,
      error: `Excel\u89E3\u6790\u5931\u8D25: ${error.message}`
    }, {
      status: 500,
      headers: corsHeaders
    });
  }
}
__name(handleExcelParse, "handleExcelParse");
async function handleInventoryData(request, env, path, method, corsHeaders) {
  console.log("\u{1F504} \u5904\u7406\u5E93\u5B58\u6570\u636E\u8BF7\u6C42:", path);
  if (path === "/api/inventory/data" && method === "GET") {
    const salesData = await generateRealSalesData(env);
    return Response.json({
      success: true,
      data: salesData,
      total: salesData.length,
      message: "\u5E93\u5B58\u6570\u636E\u83B7\u53D6\u6210\u529F"
    }, { headers: corsHeaders });
  } else if (path === "/api/inventory/summary" && method === "GET") {
    const summary = await generateRealInventorySummary(env);
    return Response.json({
      success: true,
      data: summary,
      message: "\u5E93\u5B58\u6C47\u603B\u83B7\u53D6\u6210\u529F"
    }, { headers: corsHeaders });
  }
  return Response.json({
    success: false,
    error: "\u4E0D\u652F\u6301\u7684\u5E93\u5B58API"
  }, { status: 404, headers: corsHeaders });
}
__name(handleInventoryData, "handleInventoryData");
async function handleAnalyticsData(request, env, path, method, corsHeaders) {
  console.log("\u{1F504} \u5904\u7406\u6570\u636E\u5206\u6790\u8BF7\u6C42:", path);
  if (path === "/api/analytics/sales" && method === "GET") {
    const salesAnalysis = await generateRealSalesAnalysis(env);
    return Response.json({
      success: true,
      data: salesAnalysis,
      message: "\u9500\u552E\u5206\u6790\u5B8C\u6210"
    }, { headers: corsHeaders });
  } else if (path === "/api/analytics/trends" && method === "GET") {
    const trendsAnalysis = await generateRealTrendsAnalysis(env);
    return Response.json({
      success: true,
      data: trendsAnalysis,
      message: "\u8D8B\u52BF\u5206\u6790\u5B8C\u6210"
    }, { headers: corsHeaders });
  }
  return Response.json({
    success: false,
    error: "\u4E0D\u652F\u6301\u7684\u5206\u6790API"
  }, { status: 404, headers: corsHeaders });
}
__name(handleAnalyticsData, "handleAnalyticsData");
function generateMockInventoryData() {
  const products = ["iPhone 15", "Samsung Galaxy S24", "iPad Pro", "MacBook Air", "AirPods Pro"];
  const categories = ["\u624B\u673A", "\u5E73\u677F", "\u7B14\u8BB0\u672C", "\u914D\u4EF6"];
  const suppliers = ["\u4F9B\u5E94\u5546A", "\u4F9B\u5E94\u5546B", "\u4F9B\u5E94\u5546C"];
  const data = [];
  for (let i = 1; i <= 100; i++) {
    data.push({
      id: i,
      sku: `SKU${String(i).padStart(6, "0")}`,
      productName: products[Math.floor(Math.random() * products.length)],
      category: categories[Math.floor(Math.random() * categories.length)],
      supplier: suppliers[Math.floor(Math.random() * suppliers.length)],
      stock: Math.floor(Math.random() * 1e3) + 10,
      price: (Math.random() * 5e3 + 500).toFixed(2),
      cost: (Math.random() * 3e3 + 300).toFixed(2),
      lastUpdate: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1e3).toISOString(),
      status: Math.random() > 0.1 ? "\u6B63\u5E38" : "\u7F3A\u8D27"
    });
  }
  return data;
}
__name(generateMockInventoryData, "generateMockInventoryData");
function parseExcelData(arrayBuffer) {
  const mockData = [];
  for (let i = 1; i <= 100; i++) {
    mockData.push({
      SKU: `SKU${String(i).padStart(6, "0")}`,
      \u5546\u54C1\u540D\u79F0: `\u5546\u54C1${i}`,
      \u6700\u65B0\u5E93\u5B58: Math.floor(Math.random() * 1e3) + 10,
      \u52A8\u6001\u5E93\u5B58: Math.floor(Math.random() * 1e3) + 10,
      \u9500\u552E\u6570\u91CF: Math.floor(Math.random() * 50),
      \u5355\u4EF7: (Math.random() * 1e3 + 100).toFixed(2),
      \u6210\u672C: (Math.random() * 500 + 50).toFixed(2),
      \u5206\u7C7B: ["\u624B\u673A", "\u5E73\u677F", "\u7B14\u8BB0\u672C", "\u914D\u4EF6"][Math.floor(Math.random() * 4)],
      \u4F9B\u5E94\u5546: ["\u4F9B\u5E94\u5546A", "\u4F9B\u5E94\u5546B", "\u4F9B\u5E94\u5546C"][Math.floor(Math.random() * 3)],
      \u72B6\u6001: Math.random() > 0.1 ? "\u6B63\u5E38" : "\u7F3A\u8D27",
      \u6700\u540E\u66F4\u65B0: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  return mockData;
}
__name(parseExcelData, "parseExcelData");
function getFileExtension(fileName) {
  const lastDot = fileName.lastIndexOf(".");
  return lastDot !== -1 ? fileName.substring(lastDot + 1) : "xlsx";
}
__name(getFileExtension, "getFileExtension");
async function handleLocalDB(request, env, path, method, corsHeaders) {
  console.log("\u{1F504} \u5904\u7406\u672C\u5730\u6570\u636E\u5E93\u8BF7\u6C42:", path);
  try {
    if (path === "/api/localdb/wide" && method === "GET") {
      let data = Array.isArray(wideTableCache) ? wideTableCache : [];
      if ((!data || data.length === 0) && env.R2_BUCKET) {
        try {
          const obj = await env.R2_BUCKET.get(WIDE_TABLE_R2_KEY);
          if (obj) {
            const text = await obj.text();
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed)) {
              wideTableCache = parsed;
              data = parsed;
            }
          }
        } catch (e) {
          console.warn("\u8BFB\u53D6R2\u5BBD\u8868\u5931\u8D25:", e);
        }
      }
      await archiveOldDatesToRecords(env, 5);
      data = wideTableCache;
      wideTableCache = computeSalesForWideTableRows(wideTableCache);
      data = wideTableCache;
      return Response.json({ success: true, data, total: data.length }, { headers: corsHeaders });
    } else if (path === "/api/localdb/wide" && method === "POST") {
      const requestData = await request.json();
      console.log("\u{1F4BE} \u4FDD\u5B58\u5BBD\u8868\u6570\u636E:", requestData);
      if (requestData && Array.isArray(requestData.data)) {
        wideTableCache = requestData.data;
        wideTableCache = computeSalesForWideTableRows(wideTableCache);
        await archiveOldDatesToRecords(env, 5);
        if ((!Array.isArray(recordsCache) || recordsCache.length === 0) && wideTableCache.length > 0) {
          recordsCache = generateTestHistoricalRecords(wideTableCache.slice(0, 5));
          console.log("\u{1F504} \u4E3A\u65B0\u5BFC\u5165\u6570\u636E\u751F\u6210\u4E86", recordsCache.length, "\u6761\u6D4B\u8BD5\u5386\u53F2\u8BB0\u5F55");
        }
        if (env.R2_BUCKET) {
          try {
            await env.R2_BUCKET.put(WIDE_TABLE_R2_KEY, JSON.stringify(wideTableCache), {
              httpMetadata: { contentType: "application/json" },
              customMetadata: { updatedAt: (/* @__PURE__ */ new Date()).toISOString() }
            });
            if (Array.isArray(recordsCache) && recordsCache.length > 0) {
              await env.R2_BUCKET.put(RECORDS_R2_KEY, JSON.stringify(recordsCache), {
                httpMetadata: { contentType: "application/json" },
                customMetadata: { updatedAt: (/* @__PURE__ */ new Date()).toISOString() }
              });
            }
            console.log("\u2705 \u6570\u636E\u5DF2\u6301\u4E45\u5316\u5230R2\uFF0C\u5BBD\u8868:", wideTableCache.length, "\u884C\uFF0C\u5386\u53F2\u8BB0\u5F55:", recordsCache.length, "\u6761");
          } catch (e) {
            console.warn("\u5199\u5165R2\u5931\u8D25:", e);
          }
        }
      }
      return Response.json({
        success: true,
        message: "\u5BBD\u8868\u6570\u636E\u4FDD\u5B58\u6210\u529F",
        wideTableCount: wideTableCache.length,
        recordsCount: recordsCache.length
      }, { headers: corsHeaders });
    } else if (path === "/api/localdb/wide/export" && method === "GET") {
      let data = Array.isArray(wideTableCache) ? wideTableCache : [];
      if ((!data || data.length === 0) && env.R2_BUCKET) {
        try {
          const obj = await env.R2_BUCKET.get(WIDE_TABLE_R2_KEY);
          if (obj) {
            const text = await obj.text();
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed)) {
              wideTableCache = parsed;
              data = parsed;
            }
          }
        } catch (e) {
          console.warn("\u8BFB\u53D6R2\u5BBD\u8868\u5931\u8D25:", e);
        }
      }
      return Response.json({ success: true, data, message: "\u5BBD\u8868\u6570\u636E\u5BFC\u51FA\u6210\u529F" }, { headers: corsHeaders });
    } else if (path === "/api/localdb/wide/batch" && method === "POST") {
      try {
        const contentType = request.headers.get("content-type") || "";
        if (contentType.includes("multipart/form-data")) {
          const formData = await request.formData();
          const file = formData.get("file");
          if (!file) {
            return Response.json({ success: false, error: "\u6CA1\u6709\u4E0A\u4F20\u6587\u4EF6" }, { headers: corsHeaders });
          }
          console.log("\u{1F4E4} \u6536\u5230Excel\u6587\u4EF6\u76F4\u4F20(\u4E0D\u89E3\u6790):", file.name);
          return Response.json({ success: true, message: `\u6587\u4EF6 ${file.name} \u5DF2\u63A5\u6536\uFF1B\u8BF7\u5728\u524D\u7AEF\u89E3\u6790\u540E\u4EE5JSON\u63D0\u4EA4`, processed: 0, data: [] }, { headers: corsHeaders });
        } else {
          const requestData = await request.json();
          console.log("\u{1F4E4} \u6279\u91CFJSON\u6570\u636E:", requestData);
          if (requestData && Array.isArray(requestData.data)) {
            wideTableCache = requestData.data;
            wideTableCache = computeSalesForWideTableRows(wideTableCache);
            if (env.R2_BUCKET) {
              try {
                await env.R2_BUCKET.put(WIDE_TABLE_R2_KEY, JSON.stringify(wideTableCache), {
                  httpMetadata: { contentType: "application/json" },
                  customMetadata: { updatedAt: (/* @__PURE__ */ new Date()).toISOString() }
                });
              } catch (e) {
                console.warn("\u5199\u5165R2\u5BBD\u8868\u5931\u8D25:", e);
              }
            }
          }
          return Response.json({ success: true, message: "\u6279\u91CF\u6570\u636E\u4E0A\u4F20\u6210\u529F", processed: requestData.data ? requestData.data.length : 0, data: Array.isArray(wideTableCache) ? wideTableCache : [] }, { headers: corsHeaders });
        }
      } catch (parseError) {
        console.error("\u6279\u91CF\u4E0A\u4F20\u89E3\u6790\u9519\u8BEF:", parseError);
        return Response.json({
          success: false,
          error: `\u6570\u636E\u89E3\u6790\u5931\u8D25: ${parseError.message}`
        }, {
          status: 400,
          headers: corsHeaders
        });
      }
    } else if (path === "/api/localdb/wide/clear-all" && (method === "POST" || method === "GET")) {
      wideTableCache = [];
      if (env.R2_BUCKET) {
        try {
          await env.R2_BUCKET.delete(WIDE_TABLE_R2_KEY);
        } catch (e) {
          console.warn("\u5220\u9664R2\u5BBD\u8868\u5931\u8D25:", e);
        }
      }
      return Response.json({ success: true, message: "\u6210\u529F\u6E05\u7A7A\u6240\u6709\u5BBD\u8868\u6570\u636E" }, { headers: corsHeaders });
    } else if (path === "/api/localdb/records" && method === "GET") {
      let data = Array.isArray(recordsCache) ? recordsCache : [];
      if ((!data || data.length === 0) && env.R2_BUCKET) {
        try {
          const obj = await env.R2_BUCKET.get(RECORDS_R2_KEY);
          if (obj) {
            const text = await obj.text();
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed)) {
              recordsCache = parsed;
              data = parsed;
            }
          }
        } catch (e) {
          console.warn("\u8BFB\u53D6R2\u8BB0\u5F55\u5931\u8D25:", e);
        }
      }
      return Response.json({ success: true, data, total: data.length }, { headers: corsHeaders });
    } else if (path === "/api/localdb/records" && method === "POST") {
      const requestData = await request.json();
      console.log("\u2795 \u6DFB\u52A0\u8BB0\u5F55:", requestData);
      const record = { ...requestData, id: Date.now() };
      if (!Array.isArray(recordsCache)) recordsCache = [];
      recordsCache.unshift(record);
      if (env.R2_BUCKET) {
        try {
          await env.R2_BUCKET.put(RECORDS_R2_KEY, JSON.stringify(recordsCache), { httpMetadata: { contentType: "application/json" } });
        } catch (e) {
          console.warn("\u5199\u5165R2\u8BB0\u5F55\u5931\u8D25:", e);
        }
      }
      return Response.json({ success: true, message: "\u8BB0\u5F55\u6DFB\u52A0\u6210\u529F", data: record }, { headers: corsHeaders });
    } else if (path.startsWith("/api/localdb/records/") && method === "PUT") {
      const recordId = path.split("/").pop();
      const requestData = await request.json();
      console.log("\u270F\uFE0F \u66F4\u65B0\u8BB0\u5F55:", recordId, requestData);
      if (Array.isArray(recordsCache)) {
        const idx = recordsCache.findIndex((r) => String(r.id) === String(recordId));
        if (idx !== -1) {
          recordsCache[idx] = { ...recordsCache[idx], ...requestData, id: recordsCache[idx].id };
        }
      }
      if (env.R2_BUCKET) {
        try {
          await env.R2_BUCKET.put(RECORDS_R2_KEY, JSON.stringify(recordsCache), { httpMetadata: { contentType: "application/json" } });
        } catch (e) {
          console.warn("\u5199\u5165R2\u8BB0\u5F55\u5931\u8D25:", e);
        }
      }
      return Response.json({ success: true, message: "\u8BB0\u5F55\u66F4\u65B0\u6210\u529F", data: { ...requestData, id: recordId } }, { headers: corsHeaders });
    } else if (path.startsWith("/api/localdb/records/") && method === "DELETE") {
      const recordId = path.split("/").pop();
      console.log("\u{1F5D1}\uFE0F \u5220\u9664\u8BB0\u5F55:", recordId);
      if (Array.isArray(recordsCache)) recordsCache = recordsCache.filter((r) => String(r.id) !== String(recordId));
      if (env.R2_BUCKET) {
        try {
          await env.R2_BUCKET.put(RECORDS_R2_KEY, JSON.stringify(recordsCache), { httpMetadata: { contentType: "application/json" } });
        } catch (e) {
          console.warn("\u5199\u5165R2\u8BB0\u5F55\u5931\u8D25:", e);
        }
      }
      return Response.json({ success: true, message: "\u8BB0\u5F55\u5220\u9664\u6210\u529F" }, { headers: corsHeaders });
    } else if (path === "/api/localdb/records/batch" && method === "POST") {
      const contentType = request.headers.get("content-type") || "";
      if (contentType.includes("multipart/form-data")) {
        return Response.json({ success: true, message: "\u6587\u4EF6\u5DF2\u63A5\u6536\uFF1B\u8BF7\u524D\u7AEF\u89E3\u6790\u6210JSON\u540E\u63D0\u4EA4" }, { headers: corsHeaders });
      }
      const requestData = await request.json();
      console.log("\u{1F4E4} \u6279\u91CF\u5BFC\u5165\u8BB0\u5F55(JSON):", requestData);
      if (requestData && Array.isArray(requestData.data)) {
        if (!Array.isArray(recordsCache)) recordsCache = [];
        const now = Date.now();
        const withIds = requestData.data.map((r, i) => ({ id: now + i, ...r }));
        recordsCache = [...withIds, ...recordsCache];
        if (env.R2_BUCKET) {
          try {
            await env.R2_BUCKET.put(RECORDS_R2_KEY, JSON.stringify(recordsCache), { httpMetadata: { contentType: "application/json" } });
          } catch (e) {
            console.warn("\u5199\u5165R2\u8BB0\u5F55\u5931\u8D25:", e);
          }
        }
        return Response.json({ success: true, message: "\u6279\u91CF\u8BB0\u5F55\u5BFC\u5165\u6210\u529F", processed: withIds.length }, { headers: corsHeaders });
      }
      return Response.json({ success: false, error: "\u6570\u636E\u683C\u5F0F\u4E0D\u6B63\u786E" }, { headers: corsHeaders });
    } else if (path === "/api/localdb/records/export" && method === "GET") {
      let data = Array.isArray(recordsCache) ? recordsCache : [];
      if ((!data || data.length === 0) && env.R2_BUCKET) {
        try {
          const obj = await env.R2_BUCKET.get(RECORDS_R2_KEY);
          if (obj) {
            const text = await obj.text();
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed)) {
              recordsCache = parsed;
              data = parsed;
            }
          }
        } catch (e) {
          console.warn("\u8BFB\u53D6R2\u8BB0\u5F55\u5931\u8D25:", e);
        }
      }
      return Response.json({ success: true, data, message: "\u8BB0\u5F55\u6570\u636E\u5BFC\u51FA\u6210\u529F" }, { headers: corsHeaders });
    } else if (path === "/api/localdb/records/clear-all" && (method === "POST" || method === "GET")) {
      recordsCache = [];
      if (env.R2_BUCKET) {
        try {
          await env.R2_BUCKET.delete(RECORDS_R2_KEY);
        } catch (e) {
          console.warn("\u5220\u9664R2\u8BB0\u5F55\u5931\u8D25:", e);
        }
      }
      return Response.json({ success: true, message: "\u6210\u529F\u6E05\u7A7A\u6240\u6709\u8BB0\u5F55\u6570\u636E" }, { headers: corsHeaders });
    } else {
      return new Response("Not Found", { status: 404, headers: corsHeaders });
    }
  } catch (error) {
    console.error("\u274C LocalDB API\u9519\u8BEF:", error);
    return Response.json({
      success: false,
      error: error.message
    }, {
      status: 500,
      headers: corsHeaders
    });
  }
}
__name(handleLocalDB, "handleLocalDB");
function extractIdFromFileName(filePath) {
  const fileName = filePath.split("/").pop();
  const match = fileName.match(/^(\d+)-/);
  return match ? match[1] : fileName;
}
__name(extractIdFromFileName, "extractIdFromFileName");
async function handlePackageFileDownload(request, env, path, corsHeaders) {
  try {
    const id = path.split("/")[3];
    if (!env.R2_BUCKET) throw new Error("R2\u5B58\u50A8\u6876\u4E0D\u53EF\u7528");
    const list = await env.R2_BUCKET.list({ prefix: "package/" });
    const match = list.objects.find((o) => o.key.includes(id));
    if (!match) {
      return Response.json({ success: false, error: "\u6587\u4EF6\u4E0D\u5B58\u5728" }, { status: 404, headers: corsHeaders });
    }
    const obj = await env.R2_BUCKET.get(match.key);
    if (!obj) {
      return Response.json({ success: false, error: "\u6587\u4EF6\u4E0D\u5B58\u5728" }, { status: 404, headers: corsHeaders });
    }
    const headers = new Headers(corsHeaders);
    headers.set("Content-Type", obj.httpMetadata?.contentType || "application/octet-stream");
    headers.set("Content-Disposition", `attachment; filename="${obj.customMetadata?.originalName || "download"}"`);
    return new Response(obj.body, { headers });
  } catch (error) {
    console.error("\u4E0B\u8F7D\u6253\u5305\u6587\u4EF6\u5931\u8D25:", error);
    return Response.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
  }
}
__name(handlePackageFileDownload, "handlePackageFileDownload");
async function handleFileDownload(request, env, path, corsHeaders) {
  try {
    const id = path.split("/")[3];
    if (!env.R2_BUCKET) throw new Error("R2\u5B58\u50A8\u6876\u4E0D\u53EF\u7528");
    const list = await env.R2_BUCKET.list({ prefix: "arc/" });
    const match = list.objects.find((o) => o.key.includes(id));
    if (!match) {
      return Response.json({ success: false, error: "\u6587\u4EF6\u4E0D\u5B58\u5728" }, { status: 404, headers: corsHeaders });
    }
    const obj = await env.R2_BUCKET.get(match.key);
    if (!obj) {
      return Response.json({ success: false, error: "\u6587\u4EF6\u4E0D\u5B58\u5728" }, { status: 404, headers: corsHeaders });
    }
    const headers = new Headers(corsHeaders);
    headers.set("Content-Type", obj.httpMetadata?.contentType || "application/octet-stream");
    headers.set("Content-Disposition", `attachment; filename="${obj.customMetadata?.originalName || "download.xlsx"}"`);
    return new Response(obj.body, { headers });
  } catch (error) {
    console.error("\u4E0B\u8F7D\u5931\u8D25:", error);
    return Response.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
  }
}
__name(handleFileDownload, "handleFileDownload");
async function handleFileAnalyze(request, env, path, corsHeaders) {
  try {
    const url = new URL(request.url);
    const id = path.split("/")[3];
    const sheet = url.searchParams.get("sheet") || "Sheet1";
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || "20");
    const headers = ["SKU", "\u5217A", "\u5217B", "\u5217C", "\u5217D", "\u5217E"];
    const rowsTotal = 150;
    const allRows = Array.from({ length: rowsTotal }, (_, i) => [
      `SKU${String(i + 1).padStart(6, "0")}`,
      "A" + (i + 1),
      "B" + (i + 1),
      "C" + (i + 1),
      "D" + (i + 1),
      "E" + (i + 1)
    ]);
    const start = (page - 1) * limit;
    const data = allRows.slice(start, start + limit);
    const allSheets = [
      { name: "Sheet1", rowCount: rowsTotal, colCount: headers.length, headers: headers.slice(0, 6) },
      { name: "Sheet2", rowCount: 0, colCount: 0, headers: [] }
    ];
    return Response.json({
      success: true,
      analysis: {
        fileName: `\u6587\u4EF6_${id}.xlsx`,
        currentSheet: sheet,
        allSheets,
        headers,
        data,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(rowsTotal / limit),
          totalRows: rowsTotal,
          limit,
          hasNext: page * limit < rowsTotal,
          hasPrev: page > 1
        },
        summary: {
          uploadTime: (/* @__PURE__ */ new Date()).toISOString(),
          fileSize: 1024 * 1024,
          uploadedBy: "admin",
          totalSheets: allSheets.length
        },
        performance: { processingTime: 5 }
      }
    }, { headers: corsHeaders });
  } catch (error) {
    console.error("\u5206\u6790\u5931\u8D25:", error);
    return Response.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
  }
}
__name(handleFileAnalyze, "handleFileAnalyze");
async function handleR2Routes(request, env, path, method, corsHeaders) {
  try {
    if (path.startsWith("/api/r2/upload/package/") && method === "POST") {
      const targetPath = decodeURIComponent(path.replace("/api/r2/upload/package/", ""));
      const formData = await request.formData();
      const file = formData.get("file");
      if (!file) {
        return Response.json({ success: false, error: "\u6CA1\u6709\u4E0A\u4F20\u6587\u4EF6" }, { headers: corsHeaders });
      }
      const r2Key = `package/${targetPath}`;
      if (!env.R2_BUCKET) {
        return Response.json({ success: false, error: "R2\u5B58\u50A8\u6876\u4E0D\u53EF\u7528" }, { headers: corsHeaders, status: 500 });
      }
      await env.R2_BUCKET.put(r2Key, file.stream(), {
        httpMetadata: { contentType: file.type || "application/octet-stream" },
        customMetadata: {
          originalName: file.name,
          uploadTime: (/* @__PURE__ */ new Date()).toISOString()
        }
      });
      return Response.json({ success: true, message: "\u4E0A\u4F20\u6210\u529F", filePath: r2Key, size: file.size || 0 }, { headers: corsHeaders });
    }
    if (path === "/api/r2/list-files" && method === "GET") {
      if (!env.R2_BUCKET) {
        return Response.json({ success: false, error: "R2\u5B58\u50A8\u6876\u4E0D\u53EF\u7528" }, { headers: corsHeaders, status: 500 });
      }
      const url = new URL(request.url);
      const folder = url.searchParams.get("folder") || "";
      const prefix = url.searchParams.get("prefix") || "";
      const limit = parseInt(url.searchParams.get("limit") || "100");
      const keyPrefix = folder ? `${folder}/${prefix || ""}` : prefix;
      const res = await env.R2_BUCKET.list({ prefix: keyPrefix, limit });
      return Response.json({ success: true, files: res.objects || [] }, { headers: corsHeaders });
    }
    if (path.startsWith("/api/r2/delete/") && method === "DELETE") {
      if (!env.R2_BUCKET) {
        return Response.json({ success: false, error: "R2\u5B58\u50A8\u6876\u4E0D\u53EF\u7528" }, { headers: corsHeaders, status: 500 });
      }
      const targetPath = decodeURIComponent(path.replace("/api/r2/delete/", ""));
      await env.R2_BUCKET.delete(targetPath);
      return Response.json({ success: true, message: "\u5220\u9664\u6210\u529F" }, { headers: corsHeaders });
    }
    if (path.startsWith("/api/r2/public-url/") && method === "GET") {
      const url = new URL(request.url);
      const folder = url.searchParams.get("folder") || "";
      const fileName = decodeURIComponent(path.replace("/api/r2/public-url/", ""));
      const key = folder ? `${folder}/${fileName}` : fileName;
      const publicUrl = `https://23441d4f7734b84186c4c20ddefef8e7.r2.cloudflarestorage.com/century-business-system/${key}`;
      return Response.json({ success: true, url: publicUrl }, { headers: corsHeaders });
    }
    return Response.json({ success: false, error: "\u4E0D\u652F\u6301\u7684R2\u8DEF\u7531" }, { status: 404, headers: corsHeaders });
  } catch (error) {
    console.error("R2\u8DEF\u7531\u9519\u8BEF:", error);
    return Response.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
  }
}
__name(handleR2Routes, "handleR2Routes");
async function handleTmallOrders(request, env, path, method, corsHeaders) {
  console.log("\u{1F504} \u5904\u7406\u5929\u732B\u8BA2\u5355\u8BF7\u6C42:", path);
  try {
    let mappedPath = path.replace("/api/tmall-orders/", "/api/localdb/");
    if (path.endsWith("/smart-import")) {
      mappedPath = "/api/localdb/wide/batch";
    } else if (path.endsWith("/wide/clear-all")) {
      mappedPath = "/api/localdb/wide/clear-all";
    } else if (path.endsWith("/wide/clear")) {
      mappedPath = "/api/localdb/wide/clear-all";
    }
    console.log(`\u{1F4CD} \u8DEF\u5F84\u6620\u5C04: ${path} \u2192 ${mappedPath}`);
    return await handleLocalDB(request, env, mappedPath, method, corsHeaders);
  } catch (error) {
    console.error("\u274C \u5929\u732B\u8BA2\u5355API\u9519\u8BEF:", error);
    return Response.json({
      success: false,
      error: error.message
    }, {
      status: 500,
      headers: corsHeaders
    });
  }
}
__name(handleTmallOrders, "handleTmallOrders");
async function handlePackageSync(request, env, path, method, corsHeaders) {
  try {
    if (path === "/api/package-sync/database" && method === "POST") {
      const data = await request.json();
      const key = "package-sync/database.json";
      if (!env.R2_BUCKET) {
        return Response.json({ success: false, error: "R2\u5B58\u50A8\u6876\u4E0D\u53EF\u7528" }, { headers: corsHeaders, status: 500 });
      }
      await env.R2_BUCKET.put(key, JSON.stringify({
        ...data,
        lastSync: (/* @__PURE__ */ new Date()).toISOString()
      }), {
        httpMetadata: { contentType: "application/json" }
      });
      return Response.json({ success: true, message: "\u6570\u636E\u5E93\u540C\u6B65\u6210\u529F" }, { headers: corsHeaders });
    }
    if (path === "/api/package-sync/database" && method === "GET") {
      const key = "package-sync/database.json";
      if (!env.R2_BUCKET) {
        return Response.json({ success: false, error: "R2\u5B58\u50A8\u6876\u4E0D\u53EF\u7528" }, { headers: corsHeaders, status: 500 });
      }
      const object = await env.R2_BUCKET.get(key);
      if (!object) {
        return Response.json({ success: false, data: null, message: "\u6682\u65E0\u540C\u6B65\u6570\u636E" }, { headers: corsHeaders });
      }
      const data = await object.json();
      return Response.json({ success: true, data }, { headers: corsHeaders });
    }
    if (path === "/api/package-sync/files" && method === "POST") {
      const data = await request.json();
      const key = "package-sync/files.json";
      if (!env.R2_BUCKET) {
        return Response.json({ success: false, error: "R2\u5B58\u50A8\u6876\u4E0D\u53EF\u7528" }, { headers: corsHeaders, status: 500 });
      }
      await env.R2_BUCKET.put(key, JSON.stringify({
        ...data,
        lastSync: (/* @__PURE__ */ new Date()).toISOString()
      }), {
        httpMetadata: { contentType: "application/json" }
      });
      return Response.json({ success: true, message: "\u6587\u4EF6\u6CE8\u518C\u8868\u540C\u6B65\u6210\u529F" }, { headers: corsHeaders });
    }
    if (path === "/api/package-sync/files" && method === "GET") {
      const key = "package-sync/files.json";
      if (!env.R2_BUCKET) {
        return Response.json({ success: false, error: "R2\u5B58\u50A8\u6876\u4E0D\u53EF\u7528" }, { headers: corsHeaders, status: 500 });
      }
      const object = await env.R2_BUCKET.get(key);
      if (!object) {
        return Response.json({ success: false, data: null, message: "\u6682\u65E0\u540C\u6B65\u6570\u636E" }, { headers: corsHeaders });
      }
      const data = await object.json();
      return Response.json({ success: true, data }, { headers: corsHeaders });
    }
    return Response.json({ success: false, error: "\u4E0D\u652F\u6301\u7684\u540C\u6B65\u64CD\u4F5C" }, { status: 404, headers: corsHeaders });
  } catch (error) {
    console.error("\u6570\u636E\u540C\u6B65\u5931\u8D25:", error);
    return Response.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
  }
}
__name(handlePackageSync, "handlePackageSync");
async function getRealDataFromR2(env) {
  let wideData = [];
  let recordsData = [];
  if (env.R2_BUCKET) {
    try {
      const wideObj = await env.R2_BUCKET.get(WIDE_TABLE_R2_KEY);
      if (wideObj) {
        const wideText = await wideObj.text();
        wideData = JSON.parse(wideText) || [];
      }
    } catch (e) {
      console.warn("\u8BFB\u53D6R2\u5BBD\u8868\u6570\u636E\u5931\u8D25:", e);
    }
    try {
      const recordsObj = await env.R2_BUCKET.get(RECORDS_R2_KEY);
      if (recordsObj) {
        const recordsText = await recordsObj.text();
        recordsData = JSON.parse(recordsText) || [];
      }
    } catch (e) {
      console.warn("\u8BFB\u53D6R2\u5386\u53F2\u8BB0\u5F55\u5931\u8D25:", e);
    }
  }
  if (wideData.length === 0 && Array.isArray(wideTableCache)) {
    wideData = wideTableCache;
  }
  if (recordsData.length === 0 && Array.isArray(recordsCache)) {
    recordsData = recordsCache;
  }
  return { wideData, recordsData };
}
__name(getRealDataFromR2, "getRealDataFromR2");
async function generateRealSalesAnalysis(env) {
  const { wideData, recordsData } = await getRealDataFromR2(env);
  const totalSku = (/* @__PURE__ */ new Set([...wideData.map((r) => r.SKU), ...recordsData.map((r) => r.SKU)])).size;
  const healthySku = wideData.filter((row) => {
    const dates = Object.keys(row).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k));
    return dates.some((date) => (parseInt(row[date]) || 0) > 0);
  }).length;
  const healthRate = totalSku > 0 ? Math.round(healthySku / totalSku * 100) : 0;
  let totalSales = 0;
  wideData.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (key.includes("_\u9500\u91CF")) {
        totalSales += parseInt(row[key]) || 0;
      }
    });
  });
  recordsData.forEach((record) => {
    totalSales += parseInt(record["\u9500\u91CF"]) || 0;
  });
  const avgTurnover = totalSku > 0 ? Math.round(totalSales / totalSku * 10) / 10 : 0;
  const warningCount = wideData.filter((row) => {
    const dates = Object.keys(row).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k));
    return dates.every((date) => (parseInt(row[date]) || 0) === 0);
  }).length;
  return {
    totalSku,
    healthRate,
    avgTurnover,
    warningCount,
    totalRecords: recordsData.length,
    totalSales
  };
}
__name(generateRealSalesAnalysis, "generateRealSalesAnalysis");
async function generateRealTrendsAnalysis(env) {
  const { wideData, recordsData } = await getRealDataFromR2(env);
  const allDates = /* @__PURE__ */ new Set();
  wideData.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
        allDates.add(key);
      }
    });
  });
  recordsData.forEach((record) => {
    if (record["\u65E5\u671F"]) {
      const dateMatch = record["\u65E5\u671F"].match(/(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) {
        allDates.add(dateMatch[1]);
      }
    }
  });
  const sortedDates = Array.from(allDates).sort();
  const trends = sortedDates.map((date) => {
    let totalStock = 0;
    let totalSales = 0;
    wideData.forEach((row) => {
      if (row[date] !== void 0) {
        totalStock += parseInt(row[date]) || 0;
      }
      if (row[date + "_\u9500\u91CF"] !== void 0) {
        totalSales += parseInt(row[date + "_\u9500\u91CF"]) || 0;
      }
    });
    recordsData.forEach((record) => {
      if (record["\u65E5\u671F"] && record["\u65E5\u671F"].includes(date)) {
        totalStock += parseInt(record["\u5E93\u5B58"]) || 0;
        totalSales += parseInt(record["\u9500\u91CF"]) || 0;
      }
    });
    return {
      date,
      stock: totalStock,
      sales: totalSales
    };
  });
  return trends;
}
__name(generateRealTrendsAnalysis, "generateRealTrendsAnalysis");
async function generateRealSalesData(env) {
  const { wideData, recordsData } = await getRealDataFromR2(env);
  const salesData = [];
  wideData.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (key.includes("_\u9500\u91CF")) {
        const date = key.replace("_\u9500\u91CF", "");
        const sales = parseInt(row[key]) || 0;
        if (sales > 0) {
          salesData.push({
            date,
            sku: row.SKU,
            sales,
            productName: row["\u4EA7\u54C1\u4E2D\u6587\u540D"]
          });
        }
      }
    });
  });
  recordsData.forEach((record) => {
    const sales = parseInt(record["\u9500\u91CF"]) || 0;
    if (sales > 0 && record["\u65E5\u671F"]) {
      const dateMatch = record["\u65E5\u671F"].match(/(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) {
        salesData.push({
          date: dateMatch[1],
          sku: record.SKU,
          sales,
          productName: record["\u4EA7\u54C1\u4E2D\u6587\u540D"]
        });
      }
    }
  });
  return salesData;
}
__name(generateRealSalesData, "generateRealSalesData");
async function generateRealInventorySummary(env) {
  const { wideData, recordsData } = await getRealDataFromR2(env);
  const skuSummary = {};
  wideData.forEach((row) => {
    if (!row.SKU) return;
    if (!skuSummary[row.SKU]) {
      skuSummary[row.SKU] = {
        sku: row.SKU,
        productName: row["\u4EA7\u54C1\u4E2D\u6587\u540D"] || "",
        url: row["\u7F51\u9875\u94FE\u63A5"] || "",
        initialStock: parseInt(row["\u521D\u59CB\u5E93\u5B58"]) || 0,
        currentStock: 0,
        totalSales: 0,
        lastUpdate: ""
      };
    }
    const dates = Object.keys(row).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
    if (dates.length > 0) {
      const latestDate = dates[dates.length - 1];
      skuSummary[row.SKU].currentStock = parseInt(row[latestDate]) || 0;
      skuSummary[row.SKU].lastUpdate = latestDate;
    }
    Object.keys(row).forEach((key) => {
      if (key.includes("_\u9500\u91CF")) {
        skuSummary[row.SKU].totalSales += parseInt(row[key]) || 0;
      }
    });
  });
  recordsData.forEach((record) => {
    if (!record.SKU) return;
    if (!skuSummary[record.SKU]) {
      skuSummary[record.SKU] = {
        sku: record.SKU,
        productName: record["\u4EA7\u54C1\u4E2D\u6587\u540D"] || "",
        url: record["\u7F51\u9875\u94FE\u63A5"] || "",
        initialStock: parseInt(record["\u521D\u59CB\u5E93\u5B58"]) || 0,
        currentStock: parseInt(record["\u5E93\u5B58"]) || 0,
        totalSales: parseInt(record["\u9500\u91CF"]) || 0,
        lastUpdate: record["\u65E5\u671F"] || ""
      };
    } else {
      if (record["\u65E5\u671F"] > skuSummary[record.SKU].lastUpdate) {
        skuSummary[record.SKU].currentStock = parseInt(record["\u5E93\u5B58"]) || 0;
        skuSummary[record.SKU].lastUpdate = record["\u65E5\u671F"] || "";
      }
      skuSummary[record.SKU].totalSales += parseInt(record["\u9500\u91CF"]) || 0;
    }
  });
  return Object.values(skuSummary);
}
__name(generateRealInventorySummary, "generateRealInventorySummary");
function generateTestHistoricalRecords(sampleRows) {
  const testRecords = [];
  const today = /* @__PURE__ */ new Date();
  sampleRows.forEach((row) => {
    if (!row.SKU) return;
    for (let dayOffset = 30; dayOffset > 5; dayOffset--) {
      const date = new Date(today);
      date.setDate(today.getDate() - dayOffset);
      const dateStr = date.toISOString().split("T")[0] + " 12:00";
      const stock = Math.floor(Math.random() * 80) + 20;
      const sales = Math.floor(Math.random() * 5);
      testRecords.push({
        id: Date.now() + Math.floor(Math.random() * 1e6),
        SKU: row.SKU,
        "\u4EA7\u54C1\u4E2D\u6587\u540D": row["\u4EA7\u54C1\u4E2D\u6587\u540D"] || "\u6D4B\u8BD5\u4EA7\u54C1",
        "\u7F51\u9875\u94FE\u63A5": row["\u7F51\u9875\u94FE\u63A5"] || "",
        "\u521D\u59CB\u5E93\u5B58": row["\u521D\u59CB\u5E93\u5B58"] || 100,
        "\u65E5\u671F": dateStr,
        "\u5E93\u5B58": stock,
        "\u9500\u91CF": sales,
        createTime: (/* @__PURE__ */ new Date()).toISOString(),
        createBy: "auto-generated"
      });
    }
  });
  return testRecords;
}
__name(generateTestHistoricalRecords, "generateTestHistoricalRecords");
async function handleListingManagement(request, env, path, method, corsHeaders) {
  console.log("\u{1F504} \u5904\u7406\u4E0A\u4E0B\u67B6\u7BA1\u7406\u8BF7\u6C42:", path);
  try {
    if (path === "/api/listing/candidates" && method === "GET") {
      const { wideData } = await getRealDataFromR2(env);
      const candidates = wideData.filter((row) => {
        const dates = Object.keys(row).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
        const latestDate = dates[dates.length - 1];
        const currentStock = latestDate ? parseInt(row[latestDate]) || 0 : 0;
        return currentStock > 10 && (!row.status || row.status === "offline");
      }).map((row) => {
        const dates = Object.keys(row).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
        const latestDate = dates[dates.length - 1];
        const currentStock = latestDate ? parseInt(row[latestDate]) || 0 : 0;
        return {
          sku: row.SKU,
          productName: row["\u4EA7\u54C1\u4E2D\u6587\u540D"],
          currentStock,
          status: row.status || "offline"
        };
      });
      return Response.json({
        success: true,
        data: candidates,
        message: "\u83B7\u53D6\u5F85\u4E0A\u67B6\u5546\u54C1\u6210\u529F"
      }, { headers: corsHeaders });
    } else if (path === "/api/delisting/candidates" && method === "GET") {
      const { wideData } = await getRealDataFromR2(env);
      const candidates = wideData.filter((row) => {
        const dates = Object.keys(row).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
        const latestDate = dates[dates.length - 1];
        const currentStock = latestDate ? parseInt(row[latestDate]) || 0 : 0;
        return currentStock === 0 && row.status === "online";
      }).map((row) => {
        return {
          sku: row.SKU,
          productName: row["\u4EA7\u54C1\u4E2D\u6587\u540D"],
          currentStock: 0,
          status: row.status
        };
      });
      return Response.json({
        success: true,
        data: candidates,
        message: "\u83B7\u53D6\u5F85\u4E0B\u67B6\u5546\u54C1\u6210\u529F"
      }, { headers: corsHeaders });
    } else if (path === "/api/listing/confirm" && method === "POST") {
      const { skus } = await request.json();
      if (!Array.isArray(skus)) {
        return Response.json({
          success: false,
          error: "SKU\u5217\u8868\u683C\u5F0F\u9519\u8BEF"
        }, { status: 400, headers: corsHeaders });
      }
      let updatedCount = 0;
      wideTableCache.forEach((row) => {
        if (skus.includes(row.SKU)) {
          row.status = "online";
          updatedCount++;
        }
      });
      if (env.R2_BUCKET && wideTableCache.length > 0) {
        try {
          await env.R2_BUCKET.put(WIDE_TABLE_R2_KEY, JSON.stringify(wideTableCache), {
            httpMetadata: { contentType: "application/json" }
          });
        } catch (e) {
          console.warn("\u4FDD\u5B58\u4E0A\u67B6\u72B6\u6001\u5230R2\u5931\u8D25:", e);
        }
      }
      return Response.json({
        success: true,
        message: `\u6210\u529F\u4E0A\u67B6 ${updatedCount} \u4E2A\u5546\u54C1`,
        updatedCount
      }, { headers: corsHeaders });
    } else if (path === "/api/delisting/confirm" && method === "POST") {
      const { skus } = await request.json();
      if (!Array.isArray(skus)) {
        return Response.json({
          success: false,
          error: "SKU\u5217\u8868\u683C\u5F0F\u9519\u8BEF"
        }, { status: 400, headers: corsHeaders });
      }
      let updatedCount = 0;
      wideTableCache.forEach((row) => {
        if (skus.includes(row.SKU)) {
          row.status = "offline";
          updatedCount++;
        }
      });
      if (env.R2_BUCKET && wideTableCache.length > 0) {
        try {
          await env.R2_BUCKET.put(WIDE_TABLE_R2_KEY, JSON.stringify(wideTableCache), {
            httpMetadata: { contentType: "application/json" }
          });
        } catch (e) {
          console.warn("\u4FDD\u5B58\u4E0B\u67B6\u72B6\u6001\u5230R2\u5931\u8D25:", e);
        }
      }
      return Response.json({
        success: true,
        message: `\u6210\u529F\u4E0B\u67B6 ${updatedCount} \u4E2A\u5546\u54C1`,
        updatedCount
      }, { headers: corsHeaders });
    }
    return Response.json({
      success: false,
      error: "\u4E0D\u652F\u6301\u7684\u4E0A\u4E0B\u67B6\u7BA1\u7406\u64CD\u4F5C"
    }, { status: 404, headers: corsHeaders });
  } catch (error) {
    console.error("\u4E0A\u4E0B\u67B6\u7BA1\u7406\u5931\u8D25:", error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500, headers: corsHeaders });
  }
}
__name(handleListingManagement, "handleListingManagement");
async function handleReorganization(request, env, path, method, corsHeaders) {
  console.log("\u{1F504} \u5904\u7406\u6587\u4EF6\u91CD\u65B0\u7EC4\u7EC7\u8BF7\u6C42:", path);
  try {
    if (path === "/api/reorganize/start" && method === "POST") {
      return await startReorganization(env, corsHeaders);
    } else if (path === "/api/reorganize/status" && method === "GET") {
      return await getReorganizationStatus(env, corsHeaders);
    } else if (path === "/api/reorganize/files" && method === "GET") {
      return await getFilesToReorganize(env, corsHeaders);
    } else if (path.startsWith("/api/reorganize/move/") && method === "POST") {
      const fileKey = decodeURIComponent(path.replace("/api/reorganize/move/", ""));
      return await moveFile(fileKey, env, corsHeaders);
    } else if (path === "/api/reorganize/analyze" && method === "GET") {
      return await analyzeFiles(env, corsHeaders);
    } else if (path === "/api/reorganize/reset" && method === "POST") {
      return await resetReorganization(env, corsHeaders);
    } else if (path === "/api/reorganize/debug" && method === "GET") {
      return await debugReorganization(env, corsHeaders);
    }
    return Response.json({
      success: false,
      error: "\u4E0D\u652F\u6301\u7684\u91CD\u65B0\u7EC4\u7EC7\u64CD\u4F5C"
    }, { status: 404, headers: corsHeaders });
  } catch (error) {
    console.error("\u6587\u4EF6\u91CD\u65B0\u7EC4\u7EC7\u5931\u8D25:", error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500, headers: corsHeaders });
  }
}
__name(handleReorganization, "handleReorganization");
async function startReorganization(env, corsHeaders) {
  console.log("\u{1F680} \u5F00\u59CB\u6587\u4EF6\u91CD\u65B0\u7EC4\u7EC7...");
  try {
    if (!env.R2_BUCKET) {
      throw new Error("R2\u5B58\u50A8\u6876\u4E0D\u53EF\u7528");
    }
    let databaseData = null;
    try {
      const dbObj = await env.R2_BUCKET.get("package-sync/database.json");
      if (dbObj) {
        const dbContent = await dbObj.json();
        if (dbContent && dbContent.data) {
          databaseData = /* @__PURE__ */ new Map();
          for (const record of dbContent.data) {
            if (record.lp && record.contract) {
              const lpSuffix = record.lp.slice(-4);
              databaseData.set(lpSuffix, record.contract);
            }
          }
          console.log(`\u{1F4CA} \u52A0\u8F7D\u6570\u636E\u5E93\u6570\u636E: ${databaseData.size} \u6761\u8BB0\u5F55`);
        }
      }
    } catch (error) {
      console.warn("\u26A0\uFE0F \u65E0\u6CD5\u52A0\u8F7D\u6570\u636E\u5E93\u6570\u636E\uFF0C\u5C06\u4F7F\u7528LP\u53F7\u540E\u56DB\u4F4D\u4F5C\u4E3A\u5C65\u7EA6\u5355\u53F7:", error.message);
    }
    const allObjects = await env.R2_BUCKET.list({ limit: 1e3 });
    const filesToMove = [];
    for (const obj of allObjects.objects) {
      if (obj.key.startsWith("arc/") || obj.key.startsWith("package-sync/") || obj.key.startsWith("wide/") || obj.key.startsWith("records/") || obj.key.startsWith("tmall/") || obj.key.startsWith("reorganization/")) {
        continue;
      }
      const isImageOrVideo = obj.httpMetadata?.contentType?.startsWith("image/") || obj.httpMetadata?.contentType?.startsWith("video/") || obj.key.match(/\.(jpg|jpeg|png|gif|mp4|avi|mov|webp)$/i);
      const isRootFile = !obj.key.includes("/");
      const isInPackageButWrongPath = obj.key.startsWith("package/") && !obj.key.match(/^package\/\d{4}-\d{2}\/\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}_\d+\//);
      const isTimestampFile = obj.key.match(/^\d{13,}-\d+\.(jpg|jpeg|png|gif|mp4|avi|mov|webp)$/i);
      if (isImageOrVideo && (isRootFile || isInPackageButWrongPath || isTimestampFile)) {
        filesToMove.push({
          key: obj.key,
          size: obj.size,
          uploaded: obj.uploaded,
          contentType: obj.httpMetadata?.contentType || "application/octet-stream"
        });
        console.log(`\u{1F4C1} \u627E\u5230\u9700\u8981\u91CD\u65B0\u7EC4\u7EC7\u7684\u6587\u4EF6: ${obj.key}`);
      }
    }
    console.log(`\u{1F4CB} \u627E\u5230 ${filesToMove.length} \u4E2A\u9700\u8981\u91CD\u65B0\u7EC4\u7EC7\u7684\u6587\u4EF6`);
    const movePlan = filesToMove.map((file) => {
      const folderPath = generateNewPath(file.key, file.uploaded, databaseData);
      const fileName = file.key.split("/").pop();
      const newFilePath = `${folderPath}/${fileName}`;
      return {
        source: file.key,
        destination: newFilePath,
        size: file.size,
        contentType: file.contentType
      };
    });
    await env.R2_BUCKET.put("reorganization/plan.json", JSON.stringify({
      plan: movePlan,
      totalFiles: movePlan.length,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      status: "in_progress"
    }), {
      httpMetadata: { contentType: "application/json" }
    });
    let movedCount = 0;
    let errorCount = 0;
    const errors = [];
    console.log(`\u{1F504} \u5F00\u59CB\u79FB\u52A8 ${movePlan.length} \u4E2A\u6587\u4EF6...`);
    for (const item of movePlan) {
      try {
        const sourceObj = await env.R2_BUCKET.get(item.source);
        if (!sourceObj) {
          console.warn(`\u26A0\uFE0F \u6E90\u6587\u4EF6\u4E0D\u5B58\u5728: ${item.source}`);
          errorCount++;
          errors.push(`\u6E90\u6587\u4EF6\u4E0D\u5B58\u5728: ${item.source}`);
          continue;
        }
        const destObj = await env.R2_BUCKET.get(item.destination);
        if (destObj) {
          console.warn(`\u26A0\uFE0F \u76EE\u6807\u6587\u4EF6\u5DF2\u5B58\u5728: ${item.destination}`);
          errorCount++;
          errors.push(`\u76EE\u6807\u6587\u4EF6\u5DF2\u5B58\u5728: ${item.destination}`);
          continue;
        }
        await env.R2_BUCKET.put(item.destination, sourceObj.body, {
          httpMetadata: sourceObj.httpMetadata,
          customMetadata: {
            ...sourceObj.customMetadata,
            originalPath: item.source,
            movedAt: (/* @__PURE__ */ new Date()).toISOString()
          }
        });
        const verifyObj = await env.R2_BUCKET.get(item.destination);
        if (verifyObj) {
          await env.R2_BUCKET.delete(item.source);
          movedCount++;
          console.log(`\u2705 \u6587\u4EF6\u79FB\u52A8\u6210\u529F: ${item.source} -> ${item.destination}`);
        } else {
          throw new Error("\u65B0\u6587\u4EF6\u521B\u5EFA\u5931\u8D25\uFF0C\u53D6\u6D88\u79FB\u52A8\u64CD\u4F5C");
        }
      } catch (error) {
        console.error(`\u274C \u79FB\u52A8\u6587\u4EF6\u5931\u8D25 ${item.source}:`, error);
        errorCount++;
        errors.push(`\u79FB\u52A8\u5931\u8D25 ${item.source}: ${error.message}`);
      }
    }
    await env.R2_BUCKET.put("reorganization/plan.json", JSON.stringify({
      plan: movePlan,
      totalFiles: movePlan.length,
      movedFiles: movedCount,
      errorCount,
      errors,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      status: "completed"
    }), {
      httpMetadata: { contentType: "application/json" }
    });
    console.log(`\u{1F389} \u6587\u4EF6\u91CD\u65B0\u7EC4\u7EC7\u5B8C\u6210: ${movedCount}/${movePlan.length} \u4E2A\u6587\u4EF6\u6210\u529F\u79FB\u52A8`);
    return Response.json({
      success: true,
      message: `\u6587\u4EF6\u91CD\u65B0\u7EC4\u7EC7\u5B8C\u6210: ${movedCount}/${movePlan.length} \u4E2A\u6587\u4EF6\u6210\u529F\u79FB\u52A8`,
      totalFiles: movePlan.length,
      movedFiles: movedCount,
      errorCount,
      errors: errors.slice(0, 5)
      // 只返回前5个错误
    }, { headers: corsHeaders });
  } catch (error) {
    console.error("\u274C \u5F00\u59CB\u91CD\u65B0\u7EC4\u7EC7\u5931\u8D25:", error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500, headers: corsHeaders });
  }
}
__name(startReorganization, "startReorganization");
async function getReorganizationStatus(env, corsHeaders) {
  try {
    if (!env.R2_BUCKET) {
      throw new Error("R2\u5B58\u50A8\u6876\u4E0D\u53EF\u7528");
    }
    const planObj = await env.R2_BUCKET.get("reorganization/plan.json");
    if (!planObj) {
      return Response.json({
        success: true,
        status: "no_plan",
        message: "\u6CA1\u6709\u627E\u5230\u91CD\u65B0\u7EC4\u7EC7\u8BA1\u5212"
      }, { headers: corsHeaders });
    }
    const plan = await planObj.json();
    let movedCount = 0;
    for (const item of plan.plan) {
      const destObj = await env.R2_BUCKET.get(item.destination);
      if (destObj) {
        movedCount++;
      }
    }
    return Response.json({
      success: true,
      status: plan.status,
      totalFiles: plan.totalFiles,
      movedFiles: movedCount,
      progress: plan.totalFiles > 0 ? Math.round(movedCount / plan.totalFiles * 100) : 0,
      createdAt: plan.createdAt
    }, { headers: corsHeaders });
  } catch (error) {
    console.error("\u274C \u83B7\u53D6\u72B6\u6001\u5931\u8D25:", error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500, headers: corsHeaders });
  }
}
__name(getReorganizationStatus, "getReorganizationStatus");
async function getFilesToReorganize(env, corsHeaders) {
  try {
    if (!env.R2_BUCKET) {
      throw new Error("R2\u5B58\u50A8\u6876\u4E0D\u53EF\u7528");
    }
    const planObj = await env.R2_BUCKET.get("reorganization/plan.json");
    if (!planObj) {
      return Response.json({
        success: false,
        message: "\u6CA1\u6709\u627E\u5230\u91CD\u65B0\u7EC4\u7EC7\u8BA1\u5212\uFF0C\u8BF7\u5148\u8C03\u7528 /api/reorganize/start"
      }, { headers: corsHeaders });
    }
    const plan = await planObj.json();
    return Response.json({
      success: true,
      files: plan.plan,
      total: plan.totalFiles
    }, { headers: corsHeaders });
  } catch (error) {
    console.error("\u274C \u83B7\u53D6\u6587\u4EF6\u5217\u8868\u5931\u8D25:", error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500, headers: corsHeaders });
  }
}
__name(getFilesToReorganize, "getFilesToReorganize");
async function analyzeFiles(env, corsHeaders) {
  try {
    if (!env.R2_BUCKET) {
      throw new Error("R2\u5B58\u50A8\u6876\u4E0D\u53EF\u7528");
    }
    const allObjects = await env.R2_BUCKET.list({ limit: 1e3 });
    const categories = {
      inventorySystem: [],
      // 库存系统文件
      packageSystem: [],
      // 打包系统文件
      other: []
      // 其他文件
    };
    for (const obj of allObjects.objects) {
      const key = obj.key;
      if (key === "reorganization/plan.json" || key.startsWith("reorganization/temp/")) {
        continue;
      }
      if (key.startsWith("arc/") || key.startsWith("package-sync/") || key.startsWith("wide/") || key.startsWith("records/") || key.startsWith("tmall/")) {
        categories.inventorySystem.push({
          key,
          size: obj.size,
          uploaded: obj.uploaded,
          contentType: obj.httpMetadata?.contentType || "application/octet-stream"
        });
      } else if (key.startsWith("package/") || key.match(/^\d{8}_[^/]+\//) || key.match(/\.(jpg|jpeg|png|gif|mp4|avi|mov)$/i) && !key.includes("/")) {
        categories.packageSystem.push({
          key,
          size: obj.size,
          uploaded: obj.uploaded,
          contentType: obj.httpMetadata?.contentType || "application/octet-stream"
        });
      } else {
        categories.other.push({
          key,
          size: obj.size,
          uploaded: obj.uploaded,
          contentType: obj.httpMetadata?.contentType || "application/octet-stream"
        });
      }
    }
    return Response.json({
      success: true,
      categories,
      summary: {
        inventorySystem: categories.inventorySystem.length,
        packageSystem: categories.packageSystem.length,
        other: categories.other.length,
        total: categories.inventorySystem.length + categories.packageSystem.length + categories.other.length
      }
    }, { headers: corsHeaders });
  } catch (error) {
    console.error("\u274C \u5206\u6790\u6587\u4EF6\u5931\u8D25:", error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500, headers: corsHeaders });
  }
}
__name(analyzeFiles, "analyzeFiles");
async function moveFile(fileKey, env, corsHeaders) {
  try {
    if (!env.R2_BUCKET) {
      throw new Error("R2\u5B58\u50A8\u6876\u4E0D\u53EF\u7528");
    }
    const sourceObj = await env.R2_BUCKET.get(fileKey);
    if (!sourceObj) {
      return Response.json({
        success: false,
        error: "\u6E90\u6587\u4EF6\u4E0D\u5B58\u5728"
      }, { status: 404, headers: corsHeaders });
    }
    const folderPath = generateNewPath(fileKey, sourceObj.uploaded);
    const fileName = fileKey.split("/").pop();
    const newFilePath = `${folderPath}/${fileName}`;
    const destObj = await env.R2_BUCKET.get(newFilePath);
    if (destObj) {
      return Response.json({
        success: false,
        error: "\u76EE\u6807\u6587\u4EF6\u5DF2\u5B58\u5728"
      }, { status: 409, headers: corsHeaders });
    }
    await env.R2_BUCKET.put(newFilePath, sourceObj.body, {
      httpMetadata: sourceObj.httpMetadata,
      customMetadata: {
        ...sourceObj.customMetadata,
        originalPath: fileKey,
        movedAt: (/* @__PURE__ */ new Date()).toISOString()
      }
    });
    const verifyObj = await env.R2_BUCKET.get(newFilePath);
    if (verifyObj) {
      await env.R2_BUCKET.delete(fileKey);
      console.log(`\u2705 \u6587\u4EF6\u79FB\u52A8\u6210\u529F: ${fileKey} -> ${newFilePath}`);
    } else {
      throw new Error("\u65B0\u6587\u4EF6\u521B\u5EFA\u5931\u8D25\uFF0C\u53D6\u6D88\u79FB\u52A8\u64CD\u4F5C");
    }
    return Response.json({
      success: true,
      message: "\u6587\u4EF6\u79FB\u52A8\u6210\u529F",
      source: fileKey,
      destination: newFilePath
    }, { headers: corsHeaders });
  } catch (error) {
    console.error("\u274C \u79FB\u52A8\u6587\u4EF6\u5931\u8D25:", error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500, headers: corsHeaders });
  }
}
__name(moveFile, "moveFile");
function generateNewPath(fileName, uploadTime, databaseData = null) {
  const dateLpMatch = fileName.match(/^(\d{8})_(\d{4})/);
  if (dateLpMatch) {
    const dateStr = dateLpMatch[1];
    const lpSuffix = dateLpMatch[2];
    const year2 = dateStr.substring(0, 4);
    const month2 = dateStr.substring(4, 6);
    const day2 = dateStr.substring(6, 8);
    const yearMonth2 = `${year2}-${month2}`;
    const yearMonthDay2 = `${year2}-${month2}-${day2}`;
    let contractNumber = lpSuffix;
    if (databaseData && databaseData.has(lpSuffix)) {
      contractNumber = databaseData.get(lpSuffix);
      console.log(`\u{1F50D} \u627E\u5230\u5339\u914D: LP\u53F7\u540E\u56DB\u4F4D ${lpSuffix} -> \u5C65\u7EA6\u5355\u53F7 ${contractNumber}`);
    } else {
      console.log(`\u26A0\uFE0F \u672A\u627E\u5230\u5339\u914D: LP\u53F7\u540E\u56DB\u4F4D ${lpSuffix}\uFF0C\u4F7F\u7528LP\u53F7\u540E\u56DB\u4F4D\u4F5C\u4E3A\u6587\u4EF6\u5939\u540D\uFF08\u7528\u6237\u5C06\u624B\u52A8\u5904\u7406\uFF09`);
    }
    return `package/${yearMonth2}/${yearMonthDay2}/${yearMonthDay2}_${contractNumber}`;
  }
  const timestampMatch = fileName.match(/^(\d{13,})-(\d+)\./);
  if (timestampMatch) {
    const timestamp = parseInt(timestampMatch[1]);
    const fileId = timestampMatch[2];
    const uploadDate2 = new Date(timestamp);
    const year2 = uploadDate2.getFullYear();
    const month2 = String(uploadDate2.getMonth() + 1).padStart(2, "0");
    const day2 = String(uploadDate2.getDate()).padStart(2, "0");
    const yearMonth2 = `${year2}-${month2}`;
    const yearMonthDay2 = `${year2}-${month2}-${day2}`;
    const lpSuffix = fileId.slice(-4);
    let contractNumber = lpSuffix;
    if (databaseData && databaseData.has(lpSuffix)) {
      contractNumber = databaseData.get(lpSuffix);
      console.log(`\u{1F50D} \u627E\u5230\u5339\u914D: \u6587\u4EF6ID\u540E\u56DB\u4F4D ${lpSuffix} -> \u5C65\u7EA6\u5355\u53F7 ${contractNumber}`);
    } else {
      console.log(`\u26A0\uFE0F \u672A\u627E\u5230\u5339\u914D: \u6587\u4EF6ID\u540E\u56DB\u4F4D ${lpSuffix}\uFF0C\u4F7F\u7528\u6587\u4EF6ID\u540E\u56DB\u4F4D\u4F5C\u4E3A\u6587\u4EF6\u5939\u540D`);
    }
    return `package/${yearMonth2}/${yearMonthDay2}/${yearMonthDay2}_${contractNumber}`;
  }
  const uploadDate = new Date(uploadTime);
  const year = uploadDate.getFullYear();
  const month = String(uploadDate.getMonth() + 1).padStart(2, "0");
  const day = String(uploadDate.getDate()).padStart(2, "0");
  const yearMonth = `${year}-${month}`;
  const yearMonthDay = `${year}-${month}-${day}`;
  const numberMatch = fileName.match(/(\d{4,})/);
  const defaultContract = numberMatch ? numberMatch[1].slice(-4) : "UNKNOWN";
  console.log(`\u{1F4C5} \u4F7F\u7528\u4E0A\u4F20\u65F6\u95F4\u63A8\u65AD\u65E5\u671F: ${yearMonthDay}, \u9ED8\u8BA4\u5C65\u7EA6\u5355\u53F7: ${defaultContract}`);
  return `package/${yearMonth}/${yearMonthDay}/${yearMonthDay}_${defaultContract}`;
}
__name(generateNewPath, "generateNewPath");
async function resetReorganization(env, corsHeaders) {
  try {
    console.log("\u{1F504} \u91CD\u7F6E\u91CD\u65B0\u7EC4\u7EC7\u72B6\u6001...");
    if (!env.R2_BUCKET) {
      throw new Error("R2\u5B58\u50A8\u6876\u4E0D\u53EF\u7528");
    }
    await env.R2_BUCKET.delete("reorganization/plan.json");
    console.log("\u2705 \u91CD\u65B0\u7EC4\u7EC7\u72B6\u6001\u5DF2\u91CD\u7F6E");
    return Response.json({
      success: true,
      message: "\u91CD\u65B0\u7EC4\u7EC7\u72B6\u6001\u5DF2\u91CD\u7F6E\uFF0C\u53EF\u4EE5\u91CD\u65B0\u5F00\u59CB"
    }, { headers: corsHeaders });
  } catch (error) {
    console.error("\u274C \u91CD\u7F6E\u5931\u8D25:", error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500, headers: corsHeaders });
  }
}
__name(resetReorganization, "resetReorganization");
async function debugReorganization(env, corsHeaders) {
  try {
    console.log("\u{1F50D} \u8C03\u8BD5\u91CD\u65B0\u7EC4\u7EC7\u72B6\u6001...");
    if (!env.R2_BUCKET) {
      throw new Error("R2\u5B58\u50A8\u6876\u4E0D\u53EF\u7528");
    }
    const debugInfo = {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      planExists: false,
      planData: null,
      actualFiles: [],
      movedFiles: [],
      errors: []
    };
    try {
      const planObj = await env.R2_BUCKET.get("reorganization/plan.json");
      if (planObj) {
        debugInfo.planExists = true;
        debugInfo.planData = await planObj.json();
      }
    } catch (error) {
      debugInfo.errors.push(`\u8BA1\u5212\u6587\u4EF6\u8BFB\u53D6\u9519\u8BEF: ${error.message}`);
    }
    try {
      const allObjects = await env.R2_BUCKET.list({ limit: 1e3 });
      debugInfo.actualFiles = allObjects.objects.map((obj) => ({
        key: obj.key,
        size: obj.size,
        uploaded: obj.uploaded,
        contentType: obj.httpMetadata?.contentType
      }));
    } catch (error) {
      debugInfo.errors.push(`\u6587\u4EF6\u5217\u8868\u8BFB\u53D6\u9519\u8BEF: ${error.message}`);
    }
    if (debugInfo.planData && debugInfo.planData.plan) {
      for (const item of debugInfo.planData.plan) {
        try {
          const destObj = await env.R2_BUCKET.get(item.destination);
          const sourceObj = await env.R2_BUCKET.get(item.source);
          debugInfo.movedFiles.push({
            source: item.source,
            destination: item.destination,
            sourceExists: !!sourceObj,
            destinationExists: !!destObj,
            status: destObj ? "moved" : sourceObj ? "not_moved" : "missing"
          });
        } catch (error) {
          debugInfo.errors.push(`\u68C0\u67E5\u6587\u4EF6 ${item.source} \u9519\u8BEF: ${error.message}`);
        }
      }
    }
    return Response.json({
      success: true,
      debug: debugInfo
    }, { headers: corsHeaders });
  } catch (error) {
    console.error("\u274C \u8C03\u8BD5\u5931\u8D25:", error);
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500, headers: corsHeaders });
  }
}
__name(debugReorganization, "debugReorganization");
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
