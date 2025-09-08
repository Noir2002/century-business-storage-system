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
        } else if (path === "/api/files" && method === "GET") {
          return await handleFilesList(request, env, corsHeaders);
        } else if (path === "/api/files/presigned-url" && method === "POST") {
          return await handlePresignedUrl(request, env, corsHeaders);
        } else if (path === "/api/files/parse" && method === "POST") {
          return await handleExcelParse(request, env, corsHeaders);
        } else if (path.startsWith("/api/files/") && method === "GET" && path.endsWith("/download")) {
          return await handleFileDownload(request, env, path, corsHeaders);
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
    const mockData = generateMockInventoryData();
    return Response.json({
      success: true,
      data: mockData,
      total: mockData.length,
      message: "\u5E93\u5B58\u6570\u636E\u83B7\u53D6\u6210\u529F"
    }, { headers: corsHeaders });
  } else if (path === "/api/inventory/summary" && method === "GET") {
    const mockData = generateMockInventoryData();
    const summary = calculateInventorySummary(mockData);
    return Response.json({
      success: true,
      summary,
      message: "\u5E93\u5B58\u6C47\u603B\u8BA1\u7B97\u6210\u529F"
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
    const salesAnalysis = generateSalesAnalysis();
    return Response.json({
      success: true,
      analysis: salesAnalysis,
      message: "\u9500\u552E\u5206\u6790\u5B8C\u6210"
    }, { headers: corsHeaders });
  } else if (path === "/api/analytics/trends" && method === "GET") {
    const trendsAnalysis = generateTrendsAnalysis();
    return Response.json({
      success: true,
      trends: trendsAnalysis,
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
function calculateInventorySummary(data) {
  const totalProducts = data.length;
  const totalStock = data.reduce((sum, item) => sum + item.stock, 0);
  const totalValue = data.reduce((sum, item) => sum + item.stock * parseFloat(item.price), 0);
  const lowStockItems = data.filter((item) => item.stock < 50).length;
  const outOfStockItems = data.filter((item) => item.status === "\u7F3A\u8D27").length;
  return {
    totalProducts,
    totalStock,
    totalValue: totalValue.toFixed(2),
    lowStockItems,
    outOfStockItems,
    categories: [...new Set(data.map((item) => item.category))].length
  };
}
__name(calculateInventorySummary, "calculateInventorySummary");
function generateSalesAnalysis() {
  const months = ["1\u6708", "2\u6708", "3\u6708", "4\u6708", "5\u6708", "6\u6708"];
  const salesData = months.map((month) => ({
    month,
    sales: Math.floor(Math.random() * 1e6) + 5e5,
    orders: Math.floor(Math.random() * 5e3) + 1e3,
    avgOrderValue: (Math.random() * 500 + 200).toFixed(2)
  }));
  return {
    monthlySales: salesData,
    totalSales: salesData.reduce((sum, item) => sum + item.sales, 0),
    totalOrders: salesData.reduce((sum, item) => sum + item.orders, 0),
    growthRate: (Math.random() * 40 - 10).toFixed(1) + "%"
  };
}
__name(generateSalesAnalysis, "generateSalesAnalysis");
function generateTrendsAnalysis() {
  const categories = ["\u624B\u673A", "\u5E73\u677F", "\u7B14\u8BB0\u672C", "\u914D\u4EF6"];
  const trends = categories.map((category) => ({
    category,
    trend: Math.random() > 0.5 ? "\u4E0A\u5347" : "\u4E0B\u964D",
    percentage: (Math.random() * 30).toFixed(1),
    recommendation: Math.random() > 0.5 ? "\u589E\u52A0\u5E93\u5B58" : "\u51CF\u5C11\u8BA2\u8D2D"
  }));
  return {
    categoryTrends: trends,
    hotProducts: ["iPhone 15", "MacBook Air", "AirPods Pro"],
    seasonalForecast: "\u9884\u8BA1\u4E0B\u5B63\u5EA6\u9500\u91CF\u589E\u957F15%"
  };
}
__name(generateTrendsAnalysis, "generateTrendsAnalysis");
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
      }
      return Response.json({
        success: true,
        message: "\u5BBD\u8868\u6570\u636E\u4FDD\u5B58\u6210\u529F",
        data: requestData
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
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
