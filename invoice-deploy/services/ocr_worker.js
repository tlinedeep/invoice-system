/**
 * tesseract.js OCR 辅助脚本
 * 被 Python 端调用：node ocr_worker.js <图片路径>
 * 输出识别文本到 stdout
 */
const Tesseract = require("tesseract.js");
const imgPath = process.argv[2];

if (!imgPath) {
  process.stderr.write("Usage: node ocr_worker.js <image_path>\n");
  process.exit(1);
}

Tesseract.recognize(imgPath, "chi_sim+eng", {
  logger: () => {},
})
  .then(({ data: { text } }) => {
    process.stdout.write(text);
  })
  .catch((err) => {
    process.stderr.write("OCR Error: " + err.message + "\n");
    process.exit(1);
  });
