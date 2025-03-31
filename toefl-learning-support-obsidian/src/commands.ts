import fetch from "node-fetch";
import * as cheerio from "cheerio";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";

const url = "https://www.bbc.co.uk/learningenglish/features/6-minute-english/";
const urlObj = new URL(url);
const BASE_URL = urlObj.protocol + "//" + urlObj.host;
const CONFIG_FOLDER = ".bbccli";
const AUDIO_FOLDER = "audio";
const PDF_FOLDER = "pdf";
const CACHE_FOLDER = "cache";
const CONTENT_FILE = "content.json";

const HOME = os.homedir();
const CONFIG_DIR = path.join(HOME, CONFIG_FOLDER);
const AUDIO_DIR = path.join(HOME, CONFIG_FOLDER, AUDIO_FOLDER);
const PDF_DIR = path.join(HOME, CONFIG_FOLDER, PDF_FOLDER);
const CACHE_DIR = path.join(HOME, CONFIG_FOLDER, CACHE_FOLDER);
const CONTENT_CACHE_PATH = path.join(CACHE_DIR, CONTENT_FILE);

// 以下TOEFL用の定数
const TOEFL_READING_URL = "https://test618.com/toefl/read/new-index?s={}";
const TOEFL_LISTENING_URL =
  "https://test618.com/toefl/listening/new-index?s={}";
const READING_MAX = 12;
const LISTENING_MAX = 12;
const TOEFL_BASE_URL = "https://test618.com";

// process.cwdは`/`のルートになってしまうので注意する
const CWD = os.homedir();

export async function myCommand(): Promise<any> {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR);
    fs.mkdirSync(AUDIO_DIR);
    fs.mkdirSync(PDF_DIR);
    fs.mkdirSync(CACHE_DIR);
    console.log(
      "Created directories:",
      CONFIG_DIR,
      AUDIO_DIR,
      PDF_DIR,
      CACHE_DIR
    );
  }

  let contents: Content[] = [];

  if (!fs.existsSync(CONTENT_CACHE_PATH)) {
    contents = await fetchMetadata();
    fs.writeFileSync(CONTENT_CACHE_PATH, JSON.stringify(contents, null, 2));
  } else {
    contents = JSON.parse(
      fs.readFileSync(CONTENT_CACHE_PATH, "utf-8")
    ) as Content[];
  }

  const size = contents.length;
  let output = {};

  while (true) {
    const randomIndex = Math.floor(Math.random() * size);
    const content: Content = contents[randomIndex];

    const result = await fetchContent(content);
    if (result) {
      console.log(
        `Successfully downloaded: ${content.title} (${content.episode})`
      );
    } else {
      console.log(`Failed to download: ${content.title} (${content.episode})`);
      console.log("Retrying...");
      continue;
    }
    output = {
      pageUrl: content.pageUrl,
      pdfUrl: path.join(PDF_DIR, `${content.title}.pdf`),
      audioUrl: path.join(AUDIO_DIR, `${content.title}.mp3`),
    };
    break;
  }

  return output;
}

async function fetchContent(content: Content): Promise<boolean> {
  try {
    const pageResponse = await fetch(content.pageUrl);
    if (!pageResponse.ok) {
      console.error("Failed to fetch page:", content.pageUrl);
      return false;
    }
    const pageHtml = await pageResponse.text();
    const $ = cheerio.load(pageHtml);

    const audioAnchor = $("a").filter(
      (_, el) => $(el).text().trim() === "Download Audio"
    );
    const pdfAnchor = $("a").filter(
      (_, el) => $(el).text().trim() === "Download PDF"
    );

    if (audioAnchor.length === 0 || pdfAnchor.length === 0) {
      return false;
    }

    const audioUrl = audioAnchor.attr("href");
    const pdfUrl = pdfAnchor.attr("href");

    if (!audioUrl || !pdfUrl) {
      return false;
    }

    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      console.error("Failed to fetch audio:", audioUrl);
      return false;
    }
    const audioArrayBuffer = await audioResponse.arrayBuffer();
    const audioBuffer = Buffer.from(audioArrayBuffer);

    const pdfResponse = await fetch(pdfUrl);
    if (!pdfResponse.ok) {
      console.error("Failed to fetch pdf:", pdfUrl);
      return false;
    }
    const pdfArrayBuffer = await pdfResponse.arrayBuffer();
    const pdfBuffer = Buffer.from(pdfArrayBuffer);

    const safeTitle = content.title.replace(/[\\/:*"<>|]/g, "_");
    const audioPath = path.join(AUDIO_DIR, `${safeTitle}.mp3`);
    const pdfPath = path.join(PDF_DIR, `${safeTitle}.pdf`);

    fs.writeFileSync(audioPath, audioBuffer);
    fs.writeFileSync(pdfPath, pdfBuffer);

    return true;
  } catch (error) {
    console.error("Failed to fetch content:", error);
    return false;
  }
}

async function fetchMetadata(): Promise<Content[]> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch metadata from ${url}`);
  }
  const data = await response.text();

  const contentsList: Content[] = [];
  const $ = cheerio.load(data);
  const contents = $("li.course-content-item.active");
  contents.each((index, element) => {
    const episode = $(element).find("b").text().trim();
    const title = $(element).find("h2 a").text().trim();
    const relativePath = $(element).find("h2 a").attr("href");

    if (!relativePath) return;

    const pageUrl = new URL(relativePath, BASE_URL).toString();
    const content = new Content(episode, title, pageUrl);
    contentsList.push(content);
  });

  return contentsList;
}

// 以下、TOEFLのリーディングを取得する関数
export async function fetchToeflReadingContents(): Promise<Content[]> {
  const readingContents: Content[] = [];
  for (let i = 0; i < READING_MAX; i++) {
    const url = TOEFL_READING_URL.replace("{}", i.toString());
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.error("Failed to fetch TOEFL reading URL:", url);
        continue;
      }
      const html = await response.text();
      const $ = cheerio.load(html);
      $("div.content-item-v2").each((index, element) => {
        const title = $(element).find("b").text().trim();
        const anchors = $(element).find("a");
        const problemUrl = $(anchors[1]).attr("href");
        if (title && problemUrl) {
          // episodeは不要なため空文字で代用
          readingContents.push(
            new Content("", title, TOEFL_BASE_URL + problemUrl)
          );
        }
      });
    } catch (error) {
      console.error("Error fetching TOEFL reading content:", error);
    }
  }
  return readingContents;
}

// 以下、TOEFLのリスニングを取得する関数
export async function fetchToeflListeningContents(): Promise<Content[]> {
  const listeningContents: Content[] = [];
  for (let i = 0; i < LISTENING_MAX; i++) {
    const url = TOEFL_LISTENING_URL.replace("{}", i.toString());
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.error("Failed to fetch TOEFL listening URL:", url);
        continue;
      }
      const html = await response.text();
      const $ = cheerio.load(html);
      $("div.content-item-v2").each((index, element) => {
        const title = $(element).find("b").text().trim();
        const anchors = $(element).find("a");
        const problemUrl = $(anchors[1]).attr("href");
        if (title && problemUrl) {
          listeningContents.push(
            new Content("", title, TOEFL_BASE_URL + problemUrl)
          );
        }
      });
    } catch (error) {
      console.error("Error fetching TOEFL listening content:", error);
    }
  }
  return listeningContents;
}

export class Content {
  episode: string;
  title: string;
  pageUrl: string;

  constructor(episode: string, title: string, pageUrl: string) {
    this.episode = episode;
    this.title = title;
    this.pageUrl = pageUrl;
  }
}
