import { chromium } from "playwright";
import type { Browser, BrowserContext, Page } from "playwright";
import * as path from "path";

interface NetworkRequestLog {
  url: string;
  method: string;
  requestHeaders: Record<string, string>;
  requestBody?: string;
  timestamp: number;
  error?: string;
}

class NetworkLogger {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private networkLogs: NetworkRequestLog[] = [];

  async start() {
    this.browser = await chromium.launch({
      headless: false,
    });
    this.context = await this.browser.newContext({
      bypassCSP: true,
      ignoreHTTPSErrors: true,
    });
    this.page = await this.context.newPage();

    await this.page.route("**/*", async (route, request) => {
      const logEntry: NetworkRequestLog = {
        url: request.url(),
        method: request.method(),
        requestHeaders: request.headers(),
        timestamp: Date.now(),
        requestBody: (await request.postData()) || undefined,
      };

      //   try {
      //     const response = await route.fetch();
      //     logEntry.status = response.status();

      //     // Safely capture headers without parsing
      //     try {
      //       logEntry.responseHeaders = response.headers();
      //     } catch {
      //       logEntry.responseHeaders = {};
      //     }

      //     try {
      //       logEntry.responseBody = await response.text();
      //     } catch (bodyError) {
      //       logEntry.responseBody = 'Unable to parse response body';
      //       logEntry.error = bodyError instanceof Error ? bodyError.message : 'Body parsing error';
      //     }
      //   } catch (fetchError) {
      //     logEntry.status = 0;
      //     logEntry.error = fetchError instanceof Error ? fetchError.message : 'Network fetch error';
      //   }

      this.networkLogs.push(logEntry);
      await route.continue();
    });

    setInterval(async () => {
      await this.saveNetworkLogs();
    }, 5 * 60 * 1000);
  }

  async saveNetworkLogs() {
    const outputDir = "./network-logs";
    const timestamp = new Date().toISOString().replace(/:/g, "-");
    const filename = path.join(outputDir, `network-log-${timestamp}.json`);

    await Bun.write(filename, JSON.stringify(this.networkLogs, null, 2), {
      createPath: true,
    });
    console.log(`Network logs saved to ${filename}`);
  }

  async close() {
    await this.saveNetworkLogs();
    await this.browser?.close();
  }

  getBrowser() {
    return this.browser;
  }
}

async function runNetworkLogger() {
  const logger = new NetworkLogger();
  await logger.start();

  const browser = logger.getBrowser();
  if (browser) {
    browser.on("disconnected", async () => {
      await logger.close();
      process.exit(0);
    });
  }
}

runNetworkLogger().catch(console.error);
