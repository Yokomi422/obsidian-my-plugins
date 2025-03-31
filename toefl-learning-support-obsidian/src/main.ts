import { Plugin, Notice } from "obsidian";
import {
  myCommand,
  fetchToeflReadingContents,
  fetchToeflListeningContents,
  Content,
} from "./commands";
import * as fs from "fs";
import * as path from "path";

export default class MyBBCPlugin extends Plugin {
  async onload() {
    this.addCommand({
      id: "bbccli",
      name: "Download BBC content and embed in markdown",
      callback: async () => {
        const output = await myCommand();
        new Notice(`Downloaded content: ${JSON.stringify(output)}`);

        const targetFolder = "English/TOEFL";
        const currentDate = new Date();
        console.log("Current date:", currentDate);
        const dateString = currentDate
          .toLocaleDateString("ja-JP", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          })
          .replace(/\//g, "-"); 
        console.log(currentDate.toISOString());
        const markdownFilename = `TOEFL-実践演習-${dateString}.md`;
        console.log("dateString:", dateString);
        const markdownFilePath = path.join(targetFolder, markdownFilename);

        const audioFilename = path.basename(output.audioUrl);
        const pdfFilename = path.basename(output.pdfUrl);

        const toeflReadingItems = await fetchToeflReadingContents();
        const toeflListeningItems = await fetchToeflListeningContents();

        const randomReading =
          toeflReadingItems[
            Math.floor(Math.random() * toeflReadingItems.length)
          ];
        const readingBullet = `- [${randomReading.title}](${randomReading.pageUrl})`;

        let randomListening: Content[] = [];
        if (toeflListeningItems.length >= 2) {
          const shuffled = toeflListeningItems.sort(() => Math.random() - 0.5);
          randomListening = shuffled.slice(0, 2);
        } else {
          randomListening = toeflListeningItems;
        }
        const listeningBullet = randomListening
          .map((item) => `- [${item.title}](${item.pageUrl})`)
          .join("\n");

        try {
          const audioData = fs.readFileSync(output.audioUrl);
          const pdfData = fs.readFileSync(output.pdfUrl);

          const audioVaultPath = path.join(targetFolder, audioFilename);
          const pdfVaultPath = path.join(targetFolder, pdfFilename);

          await this.app.vault.createBinary(audioVaultPath, audioData);
          await this.app.vault.createBinary(pdfVaultPath, pdfData);

          const markdownContent = `---
title: TOEFL-実践演習-${dateString}
created: ${currentDate.toISOString().replace("T", " ").slice(0, 16)}
---
## リーディング
${readingBullet}

## リスニング
${listeningBullet}

### bbc english learning
![[${audioFilename}]]
![[${pdfFilename}]]

## ライティング

## スピーキング
`;

          await this.app.vault.create(markdownFilePath, markdownContent);
          new Notice(
            "Markdownファイルと添付ファイルを作成しました: " + markdownFilePath
          );
        } catch (error) {
          new Notice("ファイル作成に失敗しました: " + error);
          console.error(error);
        }
      },
    });
  }

  onunload(): void {
    console.log("Unloading BBC plugin");
  }
}
