// Build script: собирает ДВА файла за один запуск (node build.js):
//   index.html        — страница для Сабинчик (её обнимашки → уведомление Суле)
//   index-for-me.html — страница для Сули (его обнимашки → уведомление Сабинчик)
// Кто есть кто (VIEWER) определяется автоматически: при сборке каждого файла
// esbuild подставляет своё значение __VIEWER__ в src/App.jsx.
// Токен бота и chat_id задаются в константе TG в src/App.jsx.
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

const SRC = path.join(__dirname, "src");
const OUT = __dirname;

const twCss = fs.readFileSync(path.join(SRC, "tailwind-lite.css"), "utf8");
const themeCss = fs.readFileSync(path.join(SRC, "theme.css"), "utf8");

// Editable message block: read messages.js and re-emit as window.MESSAGES
const messagesSource = fs.readFileSync(path.join(SRC, "messages.js"), "utf8");
const arrayMatch = messagesSource.match(/export const FALLBACK_MESSAGES = (\[[\s\S]*\]);/);
if (!arrayMatch) throw new Error("Could not extract messages array");

function buildHtml(bundle) {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Наша капсула времени 💌</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Manrope:wght@400;500;600&display=swap" rel="stylesheet" />
<style>
${twCss}
${themeCss}
</style>
<script>
// ─────────────────────────────────────────────────────────────
// НАШИ СООБЩЕНИЯ — редактируй прямо здесь.
// Формат: { text: "текст", date: "ДД.ММ.ГГГГ" },
// ─────────────────────────────────────────────────────────────
window.MESSAGES = ${arrayMatch[1]};
</script>
</head>
<body>
<div id="root"></div>
<script>${bundle}</script>
</body>
</html>
`;
}

for (const [file, viewer] of [
  ["index.html", "sabina"],
  ["index-for-me.html", "sulia"],
]) {
  // 1. Bundle React + App с вшитым значением VIEWER
  esbuild.buildSync({
    entryPoints: [path.join(SRC, "index.jsx")],
    bundle: true,
    minify: true,
    format: "iife",
    jsx: "automatic",
    define: {
      "process.env.NODE_ENV": '"production"',
      __VIEWER__: JSON.stringify(viewer),
    },
    outfile: path.join(OUT, "app.bundle.js"),
    absWorkingDir: SRC,
    logLevel: "info",
  });
  const bundle = fs.readFileSync(path.join(OUT, "app.bundle.js"), "utf8");
  const html = buildHtml(bundle);
  fs.writeFileSync(path.join(OUT, file), html);
  console.log("Built", file, "(viewer: " + viewer + "):", (html.length / 1024).toFixed(1), "KB");
}

fs.rmSync(path.join(OUT, "app.bundle.js"), { force: true });
