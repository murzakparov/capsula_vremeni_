#!/usr/bin/env node
/*
 Ежедневный Telegram-бот «Наша капсула времени».

 Что делает при каждом запуске (для указанного получателя):
   1. Погода в городе второй половинки + напоминание написать что-нибудь тёплое.
   2. Счётчик «вы вместе уже N дней».
   3. Круглые даты: 100/200/300/365/500/730/1000… дней — поздравление.
   4. «Месяцеверсарии»: каждое 21-е число — сколько месяцев вместе.

 Запуск:
   node bot/daily.js sulia    — сообщение Суле (погода в Нидерландах)
   node bot/daily.js sabina   — сообщение Сабинчик (погода в Бишкеке)
   node bot/daily.js both     — обоим сразу
 Флаги и переменные:
   --dry                  — только напечатать сообщения, ничего не отправлять
   TEST_DATE=ГГГГ-ММ-ДД  — проверить логику для конкретной даты
   BOT_TOKEN=...          — переопределить токен (например, из секрета GitHub)

 Автозапуск по расписанию — см. .github/workflows/love-bot.yml
 Требуется Node.js 18+ (встроенный fetch), без зависимостей.
*/

const BOT_TOKEN = process.env.BOT_TOKEN || "8513148627:AAEfxyMe_nYR3XhvhofjVP8Na5FMOSUZ2_I";
const TOGETHER_SINCE = { y: 2026, m: 1, d: 21 }; // 21 января 2026

const PEOPLE = {
  sulia: {
    name: "Суля",
    gen: "Сули", // «у Сули…»
    chatId: 8423583070,
    where: "в Бишкеке",
    lat: 42.8746,
    lon: 74.5698,
    them: "ему", // «напиши ему…»
  },
  sabina: {
    name: "Сабинчик",
    gen: "Сабинчик",
    chatId: 7871546434,
    where: "в Нидерландах",
    lat: 52.3676, // Амстердам — поменяй на координаты её города при желании
    lon: 4.9041,
    them: "ей",
  },
};

// Круглые даты в днях
const MILESTONES = new Set([100, 200, 300, 365, 400, 500, 600, 700, 730, 800, 900, 1000, 1095, 1461, 1826]);

// Коды погоды Open-Meteo (WMO) → описание по-русски
const WEATHER = {
  0: "ясно ☀️", 1: "в основном ясно 🌤", 2: "переменная облачность ⛅", 3: "пасмурно ☁️",
  45: "туман 🌫", 48: "изморозь и туман 🌫",
  51: "лёгкая морось 🌦", 53: "морось 🌦", 55: "сильная морось 🌧",
  56: "ледяная морось 🧊", 57: "сильная ледяная морось 🧊",
  61: "небольшой дождь 🌦", 63: "дождь 🌧", 65: "сильный дождь 🌧",
  66: "ледяной дождь 🧊", 67: "сильный ледяной дождь 🧊",
  71: "небольшой снег 🌨", 73: "снег ❄️", 75: "сильный снегопад ❄️", 77: "снежная крупа 🌨",
  80: "небольшой ливень 🌦", 81: "ливень 🌧", 82: "сильный ливень ⛈",
  85: "небольшой снегопад 🌨", 86: "снегопад ❄️",
  95: "гроза ⛈", 96: "гроза с градом ⛈", 99: "сильная гроза с градом ⛈",
};

function dayWord(n) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "день";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "дня";
  return "дней";
}

function monthWord(n) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "месяц";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "месяца";
  return "месяцев";
}

// Сегодняшняя дата по Бишкеку (чтобы счёт дней совпадал со страницей)
function todayYmd() {
  if (process.env.TEST_DATE) {
    const [y, m, d] = process.env.TEST_DATE.split("-").map(Number);
    return { y, m, d };
  }
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bishkek",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}

function daysTogether({ y, m, d }) {
  return Math.round(
    (Date.UTC(y, m - 1, d) - Date.UTC(TOGETHER_SINCE.y, TOGETHER_SINCE.m - 1, TOGETHER_SINCE.d)) / 86400000
  );
}

function monthsTogether({ y, m }) {
  return (y - TOGETHER_SINCE.y) * 12 + (m - TOGETHER_SINCE.m);
}

async function weather(person) {
  const url =
    "https://api.open-meteo.com/v1/forecast?latitude=" + person.lat +
    "&longitude=" + person.lon + "&current=temperature_2m,weather_code";
  const res = await fetch(url);
  if (!res.ok) throw new Error("weather http " + res.status);
  const data = await res.json();
  const t = Math.round(data.current.temperature_2m);
  return {
    temp: (t > 0 ? "+" : "") + t + "°",
    desc: WEATHER[data.current.weather_code] || "погода загадочная 🤍",
  };
}

async function buildMessage(meKey) {
  const partnerKey = meKey === "sulia" ? "sabina" : "sulia";
  const me = PEOPLE[meKey];
  const partner = PEOPLE[partnerKey];
  const ymd = todayYmd();
  const days = daysTogether(ymd);
  const months = monthsTogether(ymd);

  const lines = [`☀️ Доброе утро, ${me.name}!`];

  // Круглые даты
  if (days === 365) {
    lines.push("🎂 Сегодня РОВНО ГОД, как вы вместе! С годовщиной вас 🎉❤️");
  } else if (days === 730) {
    lines.push("🎂 Сегодня ДВА ГОДА вместе! С годовщиной 🎉❤️");
  } else if (MILESTONES.has(days)) {
    lines.push(`🎉 Круглая дата: сегодня у вас ${days} ${dayWord(days)} вместе!`);
  }

  // Месяцеверсарий — каждое 21-е число
  if (ymd.d === TOGETHER_SINCE.d && months > 0 && months % 12 !== 0) {
    lines.push(`💞 Сегодня месяцеверсарий — ${months} ${monthWord(months)} вместе (с 21 января 2026) 💍`);
  }

  // Погода у второй половинки
  try {
    const w = await weather(partner);
    lines.push(`У ${partner.gen} ${partner.where} сейчас ${w.temp} — ${w.desc}. Напиши ${partner.them} что-нибудь тёплое 💛`);
  } catch (e) {
    lines.push(`Не получилось узнать погоду ${partner.where} 🙈 Но написать ${partner.them} что-нибудь тёплое всё равно стоит 💛`);
  }

  // Счётчик дней (если сегодня не круглая дата — просто напоминание)
  if (!MILESTONES.has(days) && days > 0) {
    lines.push(`❤️ Вы вместе уже ${days} ${dayWord(days)}.`);
  }

  return lines.join("\n");
}

async function send(chatId, text) {
  const apiUrl = "https://api.telegram.org/bot" + BOT_TOKEN + "/sendMessage";
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error("Telegram error: " + JSON.stringify(data));
}


async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const who = args.find((a) => !a.startsWith("--")) || "both";
  const recipients = who === "both" ? ["sulia", "sabina"] : [who];

  for (const key of recipients) {
    if (!PEOPLE[key]) throw new Error("Неизвестный получатель: " + key + " (ожидалось sulia | sabina | both)");
    const text = await buildMessage(key);
    if (dry) {
      console.log(`\n── [dry] сообщение для ${PEOPLE[key].name} (chat_id=${PEOPLE[key].chatId}) ──`);
      console.log(text);
    } else {
      await send(PEOPLE[key].chatId, text);
      console.log(`Отправлено: ${PEOPLE[key].name}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
