import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { NOTES_KEY, TODOS_KEY, WEATHER_KEY, wmo } from "@/lib/constants";

export function DateWidget() {
  const now = new Date();
  return (
    <div className="widget-card widget-date">
      <div className="widget-head">
        <Icon name="calendar-days" size={11} style={{ marginRight: 5, verticalAlign: "-1px" }} />
        Today
      </div>
      <div className="date-day">{now.toLocaleDateString([], { weekday: "long" })}</div>
      <div className="date-full">{now.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" })}</div>
    </div>
  );
}

interface WeatherData {
  temp: number;
  code: number;
  place: string;
}
export function WeatherWidget() {
  const [data, setData] = useState<WeatherData | null>(null);
  const [msg, setMsg] = useState("Loading…");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const cached = JSON.parse(localStorage.getItem(WEATHER_KEY) || "null");
        if (cached && Date.now() - cached.ts < 3600e3) {
          if (alive) setData(cached.data);
          return;
        }
        let lat: number | undefined, lon: number | undefined, place = "";
        try {
          const r = await fetch("https://ipapi.co/json/");
          if (r.ok) {
            const j = await r.json();
            lat = j.latitude;
            lon = j.longitude;
            place = j.city || "";
          }
        } catch {
        }
        if (lat == null || lon == null) {
          if (alive) {
            setMsg("Location unavailable");
            setFailed(true);
          }
          return;
        }
        const wr = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&temperature_unit=fahrenheit`,
        );
        if (!wr.ok) throw new Error(`Weather request failed: ${wr.status}`);
        const wj = await wr.json();
        const c = wj.current || {};
        if (!Number.isFinite(c.temperature_2m) || !Number.isFinite(c.weather_code)) {
          throw new Error("Weather response was incomplete");
        }
        const d: WeatherData = { temp: Math.round(c.temperature_2m), code: c.weather_code, place };
        try {
          localStorage.setItem(WEATHER_KEY, JSON.stringify({ ts: Date.now(), data: d }));
        } catch {
        }
        if (alive) setData(d);
      } catch {
        if (alive) {
          setMsg("Weather unavailable");
          setFailed(true);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const w = data ? wmo(data.code) : null;
  return (
    <div className="widget-card" id="widget-weather">
      <div className="widget-head"><Icon name="cloud-sun" size={12} />Weather</div>
      <div className="weather-body">
        {data && w ? (
          <>
            <span className="weather-icon">
              <Icon name={w.icon as IconName} size={24} />
            </span>
            <span className="weather-temp">{data.temp}°</span>
            <span className="weather-meta">
              {w.text}
              {data.place ? " · " + data.place : ""}
            </span>
          </>
        ) : (
          <span className="widget-inline-status weather-loading">
            <Icon name={failed ? "badge-alert" : "loader-circle"} size={14} anim={failed ? undefined : "loader"} />
            {msg}
          </span>
        )}
      </div>
    </div>
  );
}

interface Todo {
  text: string;
  done: boolean;
}
function loadTodos(): Todo[] {
  try {
    return JSON.parse(localStorage.getItem(TODOS_KEY) || "[]");
  } catch {
    return [];
  }
}
export function TodoWidget() {
  const [todos, setTodos] = useState<Todo[]>(loadTodos);
  const [input, setInput] = useState("");

  const persist = (next: Todo[]) => {
    setTodos(next);
    try {
      localStorage.setItem(TODOS_KEY, JSON.stringify(next));
    } catch {
    }
  };

  return (
    <div className="widget-card widget-todo">
      <div className="widget-head"><Icon name="check" size={12} />To-do</div>
      <div className="todo-list">
        {todos.map((item, i) => (
          <label key={i} className={"todo-item" + (item.done ? " done" : "")}>
            <input
              type="checkbox"
              checked={item.done}
              onChange={() => persist(todos.map((t, j) => (j === i ? { ...t, done: !t.done } : t)))}
            />
            <span className="todo-text">{item.text}</span>
            <button
              type="button"
              className="todo-del"
              aria-label={`Remove ${item.text}`}
              title="Remove task"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                persist(todos.filter((_, j) => j !== i));
              }}
            >
              ×
            </button>
          </label>
        ))}
      </div>
      <form
        className="todo-form"
        onSubmit={(e) => {
          e.preventDefault();
          const v = input.trim();
          if (!v) return;
          persist([...todos, { text: v, done: false }]);
          setInput("");
        }}
      >
        <input
          className="todo-input"
          placeholder="Add a task…"
          spellCheck={false}
          value={input}
          onInput={(e) => setInput(e.currentTarget.value)}
        />
      </form>
    </div>
  );
}

const POMO_DEFAULT = 25 * 60;
function fmtClock(s: number) {
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}
export function PomodoroWidget() {
  const [remaining, setRemaining] = useState(POMO_DEFAULT);
  const [running, setRunning] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) return;
    timer.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          setRunning(false);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [running]);

  return (
    <div className="widget-card widget-pomo">
      <div className="widget-head">
        <Icon name="hourglass" size={11} style={{ marginRight: 5, verticalAlign: "-1px" }} />
        Focus timer
      </div>
      <div className="pomo-readout">
        <Icon name="timer" size={18} />
        <div className="pomo-time">{fmtClock(remaining)}</div>
      </div>
      <div className="pomo-ctrls">
        <button
          className="pomo-btn"
          onClick={() => {
            if (running) setRunning(false);
            else {
              if (remaining <= 0) setRemaining(POMO_DEFAULT);
              setRunning(true);
            }
          }}
        >
          {running ? "Pause" : "Start"}
        </button>
        <button
          className="pomo-btn"
          onClick={() => {
            setRunning(false);
            setRemaining(POMO_DEFAULT);
          }}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

export function NotesWidget() {
  const [value, setValue] = useState(() => {
    try {
      return localStorage.getItem(NOTES_KEY) || "";
    } catch {
      return "";
    }
  });
  return (
    <div className="widget-card">
      <div className="widget-head">
        <Icon name="square-pen" size={11} style={{ marginRight: 5, verticalAlign: "-1px" }} />
        Notes
      </div>
      <textarea
        className="widget-notes"
        placeholder="Jot something down…"
        spellCheck={false}
        value={value}
        onInput={(e) => {
          setValue(e.currentTarget.value);
          try {
            localStorage.setItem(NOTES_KEY, e.currentTarget.value);
          } catch {
          }
        }}
      />
    </div>
  );
}

interface BatteryInfo {
  level: number;
  charging: boolean;
  chargingTime: number;
  dischargingTime: number;
}

interface BatteryManager extends EventTarget {
  level: number;
  charging: boolean;
  chargingTime: number;
  dischargingTime: number;
}

type BatteryState = "checking" | "ready" | "unsupported" | "error";

function formatBatteryTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const minutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (!hours) return `${mins}m`;
  if (!mins) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

export function BatteryWidget() {
  const [info, setInfo] = useState<BatteryInfo | null>(null);
  const [state, setState] = useState<BatteryState>("checking");

  useEffect(() => {
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManager> };
    if (typeof nav.getBattery !== "function") {
      setState("unsupported");
      return;
    }
    let battery: BatteryManager | null = null;
    const update = () => {
      if (!battery) return;
      setInfo({
        level: Math.round(battery.level * 100),
        charging: battery.charging,
        chargingTime: battery.chargingTime,
        dischargingTime: battery.dischargingTime,
      });
      setState("ready");
    };
    nav
      .getBattery()
      .then((b) => {
        battery = b;
        update();
        b.addEventListener("levelchange", update);
        b.addEventListener("chargingchange", update);
        b.addEventListener("chargingtimechange", update);
        b.addEventListener("dischargingtimechange", update);
      })
      .catch(() => setState("error"));
    return () => {
      if (battery) {
        battery.removeEventListener("levelchange", update);
        battery.removeEventListener("chargingchange", update);
        battery.removeEventListener("chargingtimechange", update);
        battery.removeEventListener("dischargingtimechange", update);
      }
    };
  }, []);

  const icon: IconName = info?.charging
      ? "battery-charging"
      : (info?.level ?? 100) <= 10
        ? "battery-warning"
        : (info?.level ?? 100) <= 35
          ? "battery-low"
          : (info?.level ?? 100) <= 70
            ? "battery-medium"
            : "battery-full";

  const danger = !!info && !info.charging && info.level <= 10;
  const chargeTime = info?.charging ? formatBatteryTime(info.chargingTime) : "";
  const remainingTime = info && !info.charging ? formatBatteryTime(info.dischargingTime) : "";
  const detail = !info
    ? ""
    : info.charging
      ? info.level >= 100
        ? "Fully charged"
        : chargeTime
          ? `Full in ${chargeTime}`
          : "Charging"
      : danger
        ? "Low battery"
        : remainingTime
          ? `${remainingTime} remaining`
          : "On battery";

  return (
    <div className="widget-card widget-battery">
      <div className="widget-head"><Icon name="battery-full" size={12} />Battery</div>
      {state === "ready" && info ? (
        <div className="battery-body">
          <span className="battery-icon" style={danger ? { color: "#e03838" } : undefined}>
            <Icon name={icon} size={26} />
          </span>
          <span className="battery-pct">{info.level}%</span>
          <span className="battery-meta">{detail}</span>
        </div>
      ) : state === "checking" ? (
        <span className="widget-inline-status weather-loading">
          <Icon name="loader-circle" size={14} anim="loader" />
          Reading battery…
        </span>
      ) : (
        <span className="widget-inline-status weather-loading">
          <Icon name="badge-alert" size={14} />
          {state === "unsupported" ? "Battery access unavailable in this browser" : "Could not read this battery"}
        </span>
      )}
    </div>
  );
}
