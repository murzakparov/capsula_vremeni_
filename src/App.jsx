import React, { useEffect, useMemo, useRef, useState } from "react";
import { FALLBACK_MESSAGES } from "./messages.js";

// ─────────────────────────────────────────────────────────────
// Конфигурация
// ─────────────────────────────────────────────────────────────

const ME = { label: "Моё время", city: "Бишкек", tz: "Asia/Bishkek" };
const HER = { label: "Твоё время", city: "Нидерланды", tz: "Europe/Amsterdam" };

const DAY_START = 6; // 6:00 — начало «дня» для темы
const DAY_END = 18; // 18:00 — начало «ночи» для темы

// Начало нашей истории — для счётчика «мы вместе уже N дней»
// Формат: год, месяц (0 = январь!), день
const TOGETHER_SINCE = new Date(2026, 0, 21); // 21 января 2026

// Секретное сообщение — пасхалка: 5 быстрых нажатий на сердечко между часами
const SECRET_MESSAGE =
  "Если ты читаешь это — значит, ты нашла то, что я спрятал только для тебя. Из всех чудес на свете я бы снова и снова выбирал тебя — каждый день, в любом часовом поясе. — Твой Суля";

// Сообщения: можно редактировать window.MESSAGES прямо в index.html
const MESSAGES =
  typeof window !== "undefined" && Array.isArray(window.MESSAGES) && window.MESSAGES.length > 0
    ? window.MESSAGES
    : FALLBACK_MESSAGES;

// ─────────────────────────────────────────────────────────────
// Telegram-уведомления об обнимашках
//   botToken     — токен бота от @BotFather
//   chatIdSulia  — chat_id Сули (сюда летят её обнимашки)
//   chatIdSabina — chat_id Сабинчик (сюда летят твои обнимашки)
// Менять здесь и пересобирать: node build.js (соберёт оба файла).
// ─────────────────────────────────────────────────────────────

const TG = {
  botToken: "8513148627:AAEfxyMe_nYR3XhvhofjVP8Na5FMOSUZ2_I",
  chatIdSulia: 8423583070,
  chatIdSabina: 7871546434,
};

// VIEWER определяется САМ при сборке: build.js подставляет __VIEWER__
// ("sabina" для index.html, "sulia" для index-for-me.html)
const VIEWER = typeof __VIEWER__ !== "undefined" ? __VIEWER__ : "sabina";

// Счётчик обнимашек: у каждой страницы свой ключ в localStorage
const HUG_KEY = VIEWER === "sulia" ? "hugCountSulia" : "hugCount";

// Динамические подписи под часами — правила проверяются по порядку.
// me / her — текущий час (0–23) в Бишкеке и Нидерландах.
const MOOD_LINES = [
  {
    when: (me, her) => (me >= 23 || me < 6) && her >= 18,
    text: "Я, скорее всего, уже сплю и вижу тебя во сне… но эта капсула не спит никогда — она всегда здесь, для тебя.",
  },
  {
    when: (me, her) => (me >= 23 || me < 6) && (her >= 23 || her < 6),
    text: "Мы оба спим под одним небом. Даже во сне я где-то рядом с тобой.",
  },
  {
    when: (_me, her) => her < 6,
    text: "У тебя глубокая ночь. Спи сладко, моя принцесса, — я посторожу твои сны.",
  },
  {
    when: (_me, her) => her >= 6 && her < 11,
    text: "У тебя утро, а я успел соскучиться, пока ты спала. Доброе утро, котик❤️",
  },
  {
    when: (me, her) => me >= 18 && her < 18,
    text: "У меня уже вечер, у тебя ещё день. Разница в часах — просто цифры: моя любовь долетает до тебя мгновенно.",
  },
  {
    when: () => true,
    text: "Мы оба сейчас не спим — значит, наши мысли уже могли встретиться где-то над шестью тысячами километров.",
  },
];

// ─────────────────────────────────────────────────────────────
// Утилиты времени
// ─────────────────────────────────────────────────────────────

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function getTimeParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? "00";
  return { hh: get("hour"), mm: get("minute"), ss: get("second"), hour: Number(get("hour")) % 24 };
}

function getDateLine(date, timeZone) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

const isDaytime = (hour) => hour >= DAY_START && hour < DAY_END;

const RU_MONTHS = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

// «13.07.2026» / «13/07/26» → «13 июля 2026»
function formatSentDate(raw) {
  // Принимает '.' и '/' как разделители, год — в формате YY или YYYY
  const m = /^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4}|\d{2})$/.exec((raw || "").trim());
  if (!m) return raw;
  let year = m[3];
  if (year.length === 2) {
    year = (Number(year) < 50 ? "20" : "19") + year;
  }
  return `${Number(m[1])} ${RU_MONTHS[Number(m[2]) - 1]} ${year}`;
}

function hoursWord(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "час";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "часа";
  return "часов";
}

function daysWord(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "день";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "дня";
  return "дней";
}

function timesWord(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "раза";
  return "раз";
}

// ─────────────────────────────────────────────────────────────
// Отправка уведомления в Telegram
// ─────────────────────────────────────────────────────────────

function tgTarget() {
  const token = String(TG.botToken || "").trim();
  const chatId = String(
    (VIEWER === "sabina" ? TG.chatIdSulia : TG.chatIdSabina) || ""
  ).trim();
  const empty = (v) => !v || v.startsWith("ВСТАВЬ");
  return empty(token) || empty(chatId) ? null : { token, chatId };
}

// Отправка произвольного текста второму человеку
function sendTelegram(text) {
  const cfg = tgTarget();
  if (!cfg) return; // токен/chat_id не заполнены — работаем как раньше, без уведомлений
  const url =
    "https://api.telegram.org/bot" +
    cfg.token +
    "/sendMessage?chat_id=" +
    encodeURIComponent(cfg.chatId) +
    "&text=" +
    encodeURIComponent(text);
  try {
    fetch(url).catch(() => {});
  } catch {
    /* нет сети — уведомление не уйдёт, страница работает дальше */
  }
}

// batch — сколько нажатий склеено в это уведомление, total — счётчик всего
function sendTelegramHug(batch, total) {
  const name = VIEWER === "sabina" ? "Сабинчик" : "Суля";
  const verb = VIEWER === "sabina" ? "обняла" : "обнял";
  const times = batch > 1 ? ` ${batch} ${timesWord(batch)} подряд` : "";
  sendTelegram(`🤗 ${name} только что ${verb} тебя${times}!\n❤️ Всего обнимашек: ${total}`);
}

function memoriesWord(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "воспоминание";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "воспоминания";
  return "воспоминаний";
}

// batch — сколько воспоминаний открыто подряд (быстрые открытия склеиваются)
function sendTelegramCapsule(batch) {
  const name = VIEWER === "sabina" ? "Сабинчик" : "Суля";
  const verb = VIEWER === "sabina" ? "открыла" : "открыл";
  const readVerb = VIEWER === "sabina" ? "прочитала" : "прочитал";
  const text =
    batch > 1
      ? `💌 ${name} сейчас читает вашу капсулу времени — ${readVerb} ${batch} ${memoriesWord(batch)} подряд`
      : `💌 ${name} только что ${verb} вашу капсулу времени и читает воспоминание`;
  sendTelegram(text);
}

// ─────────────────────────────────────────────────────────────
// Компоненты
// ─────────────────────────────────────────────────────────────

function SkyBackdrop() {
  const stars = useMemo(
    () =>
      Array.from({ length: 46 }, (_, i) => ({
        id: i,
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 72}%`,
        size: Math.random() * 2 + 1,
        delay: `${(Math.random() * 5).toFixed(2)}s`,
        duration: `${(3 + Math.random() * 4).toFixed(2)}s`,
      })),
    []
  );
  return (
    <>
      <div className="backdrop backdrop--day" aria-hidden="true" />
      <div className="backdrop backdrop--night" aria-hidden="true" />
      <div className="stars" aria-hidden="true">
        {stars.map((s) => (
          <span
            key={s.id}
            className="star"
            style={{
              left: s.left,
              top: s.top,
              width: `${s.size}px`,
              height: `${s.size}px`,
              animationDelay: s.delay,
              animationDuration: s.duration,
            }}
          />
        ))}
      </div>
    </>
  );
}

function ClockCard({ label, city, time, dateLine }) {
  const day = isDaytime(time.hour);
  return (
    <div className="card clock-card p-6 flex flex-col items-center text-center">
      <div className="clock-label text-xs uppercase tracking-widest">
        {label} · {city}
      </div>
      <div className="clock-time font-serif mt-3" aria-live="off">
        {time.hh}:{time.mm}
        <span className="clock-sec">:{time.ss}</span>
      </div>
      <div className="clock-date text-sm mt-2">
        <span className="clock-icon" aria-hidden="true">{day ? "☀" : "☾"}</span>
        {dateLine}
      </div>
    </div>
  );
}

function pickNextIndex(prev, length) {
  if (length <= 1) return 0;
  let next = prev;
  while (next === prev) {
    next = Math.floor(Math.random() * length);
  }
  return next;
}

function TimeCapsule() {
  const [index, setIndex] = useState(null);
  const [visible, setVisible] = useState(true);
  const [busy, setBusy] = useState(false);
  // Пинг в Telegram «открыл(а) капсулу»: быстрые открытия склеиваются в одно уведомление
  const pingRef = useRef({ opens: 0, timer: null });

  const reveal = () => {
    if (busy) return;
    const p = pingRef.current;
    p.opens += 1;
    if (p.timer) clearTimeout(p.timer);
    p.timer = setTimeout(() => {
      sendTelegramCapsule(p.opens);
      p.opens = 0;
      p.timer = null;
    }, 2500);
    setBusy(true);
    setVisible(false);
    setTimeout(() => {
      setIndex((prev) => pickNextIndex(prev, MESSAGES.length));
      setVisible(true);
      setTimeout(() => setBusy(false), 500);
    }, 450);
  };

  const message = index === null ? null : MESSAGES[index];

  return (
    <section className="card capsule p-8 sm:p-10 w-full flex flex-col items-center text-center">
      <div className="capsule-quote font-serif select-none" aria-hidden="true">„</div>
      <div className={`capsule-body fade ${visible ? "fade--in" : "fade--out"} flex flex-col items-center justify-center`}>
        {message ? (
          <>
            <p className="capsule-text font-serif">{message.text}</p>
            <p className="capsule-date text-sm mt-6">Отправлено {formatSentDate(message.date)}</p>
          </>
        ) : (
          <>
            <p className="capsule-text capsule-text--intro font-serif">
              Здесь хранятся мои сообщения — тёплые, смешные и очень честные.
              Когда скучаешь, просто открой капсулу.
            </p>
            <p className="capsule-date text-sm mt-6">Мои сообщения ждут тебя</p>
          </>
        )}
      </div>
      <button type="button" className="btn mt-8" onClick={reveal} disabled={busy}>
        {message ? "Вернуть ещё одно воспоминание" : "Открыть капсулу"}
      </button>
    </section>
  );
}

// Кнопка обнимашек: салют из сердечек + счётчик в localStorage
function HugButton() {
  const [count, setCount] = useState(() => {
    try {
      return Number(window.localStorage.getItem(HUG_KEY)) || 0;
    } catch {
      return 0;
    }
  });
  const [hearts, setHearts] = useState([]);
  const idRef = useRef(0);
  const pendingRef = useRef({ hugs: 0, timer: null });

  const sendHug = () => {
    const next = count + 1;
    setCount(next);
    try {
      window.localStorage.setItem(HUG_KEY, String(next));
    } catch {
      /* localStorage недоступен — считаем только в рамках сессии */
    }
    // Telegram: быстрые нажатия подряд склеиваются в одно уведомление,
    // чтобы не заспамить чат — отправка через 1.8 с после последнего клика
    const p = pendingRef.current;
    p.hugs += 1;
    clearTimeout(p.timer);
    p.timer = setTimeout(() => {
      sendTelegramHug(p.hugs, next);
      p.hugs = 0;
    }, 1800);
    const burst = Array.from({ length: 10 }, () => ({
      id: idRef.current++,
      left: 10 + Math.random() * 80, // % по ширине
      size: (0.8 + Math.random() * 1.1).toFixed(2), // rem
      drift: Math.round((Math.random() * 2 - 1) * 70), // px вбок
      duration: (1.7 + Math.random() * 1.2).toFixed(2), // s
      delay: (Math.random() * 0.25).toFixed(2), // s
      char: Math.random() < 0.22 ? "🤍" : "❤️",
    }));
    setHearts((prev) => [...prev, ...burst]);
    const ids = new Set(burst.map((h) => h.id));
    setTimeout(() => {
      setHearts((prev) => prev.filter((h) => !ids.has(h.id)));
    }, 3400);
  };

  return (
    <section className="hug relative w-full flex flex-col items-center text-center">
      <div className="hug-hearts" aria-hidden="true">
        {hearts.map((h) => (
          <span
            key={h.id}
            className="hug-heart"
            style={{
              left: `${h.left}%`,
              fontSize: `${h.size}rem`,
              animationDuration: `${h.duration}s`,
              animationDelay: `${h.delay}s`,
              "--drift": `${h.drift}px`,
            }}
          >
            {h.char}
          </span>
        ))}
      </div>
      <button type="button" className="btn btn--ghost" onClick={sendHug}>
        Отправить обнимашку 🤗
      </button>
      <p className="hug-count text-xs mt-3" aria-live="polite">
        {count === 0
          ? VIEWER === "sulia"
            ? "Обнимашки долетают до Нидерландов м��новенно — проверь"
            : "Обнимашки долетают до Бишкека мгновенно — проверь"
          : VIEWER === "sulia"
            ? `Ты обнял её уже ${count} ${timesWord(count)} ❤️`
            : `Ты обняла меня уже ${count} ${timesWord(count)} ❤️`}
      </p>
    </section>
  );
}

// Пасхалка: окно с секретным сообщением
function SecretNote({ onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="secret-overlay" role="dialog" aria-modal="true" aria-label="Секретное сообщение" onClick={onClose}>
      <div className="card secret-card p-8 flex flex-col items-center text-center" onClick={(e) => e.stopPropagation()}>
        <div className="secret-emoji" aria-hidden="true">🤫</div>
        <p className="secret-title font-serif">Ты нашла наш секрет</p>
        <p className="secret-text font-serif">{SECRET_MESSAGE}</p>
        <button type="button" className="btn mt-8" onClick={onClose}>
          Спрятать обратно ❤️
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Приложение
// ─────────────────────────────────────────────────────────────

export default function App() {
  const now = useNow(1000);
  const meTime = getTimeParts(now, ME.tz);
  const herTime = getTimeParts(now, HER.tz);

  // Тема зависит от времени в Нидерландах (?theme=day|night — для проверки)
  const override =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("theme")
      : null;
  const isNight = override ? override === "night" : !isDaytime(herTime.hour);

  const mood = MOOD_LINES.find((line) => line.when(meTime.hour, herTime.hour));
  const hoursApart = (meTime.hour - herTime.hour + 24) % 24;
  const daysTogether = Math.max(0, Math.floor((now - TOGETHER_SINCE) / 86400000));

  // Пасхалка: 5 быстрых нажатий на сердечко между часами
  const [secretOpen, setSecretOpen] = useState(false);
  const heartClicksRef = useRef({ count: 0, timer: null });
  const onHeartClick = () => {
    const s = heartClicksRef.current;
    s.count += 1;
    clearTimeout(s.timer);
    if (s.count >= 5) {
      s.count = 0;
      setSecretOpen(true);
    } else {
      s.timer = setTimeout(() => {
        s.count = 0;
      }, 1400);
    }
  };

  return (
    <div className={`app min-h-screen relative overflow-hidden ${isNight ? "night" : ""}`}>
      <SkyBackdrop />
      <main className="relative z-10 mx-auto w-full max-w-3xl px-6 py-14 flex flex-col items-center">
        <header className="flex flex-col items-center text-center">
          <p className="eyebrow">Кыргызстан ↔ Нидерланды · 6 186 км</p>
          <h1 className="title font-serif mt-4">
            Наша капсула <em>времени</em>
          </h1>
          <p className="together mt-6">
            Мы вместе уже <span className="together-num">{daysTogether}</span> {daysWord(daysTogether)}
          </p>
        </header>

        <section className="clocks relative grid grid-cols-1 sm:grid-cols-2 gap-4 w-full mt-10">
          <ClockCard label={ME.label} city={ME.city} time={meTime} dateLine={getDateLine(now, ME.tz)} />
          <button
            type="button"
            className="clock-heart"
            onClick={onHeartClick}
            aria-label="Сердечко"
          >
            ♥
          </button>
          <ClockCard label={HER.label} city={HER.city} time={herTime} dateLine={getDateLine(now, HER.tz)} />
        </section>

        <p className="mood font-serif italic text-center mt-8">{mood.text}</p>

        <div className="w-full mt-10">
          <TimeCapsule />
        </div>

        <div className="w-full mt-8">
          <HugButton />
        </div>

        <footer className="footer text-xs text-center mt-12">
          С любовью от Сули — для Сабинчик 💌
          <span className="footer-sep"> · </span>
          {hoursApart} {hoursWord(hoursApart)} разницы и одно сердце на двоих
        </footer>
      </main>

      {secretOpen && <SecretNote onClose={() => setSecretOpen(false)} />}
    </div>
  );
}
