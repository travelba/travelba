"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Send, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { SERVICE_KEYS } from "@/lib/site";

type Status = "idle" | "loading" | "success" | "error";

export function ContactForm() {
  const t = useTranslations("Contact.form");
  const tServices = useTranslations("Services");
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");

    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Request failed");
      setStatus("success");
      form.reset();
    } catch {
      setStatus("error");
    }
  }

  const inputClass =
    "w-full rounded-xl border border-border bg-background/60 px-4 py-3 text-sm text-foreground placeholder:text-muted/70 outline-none transition-colors focus:border-accent/60 focus:ring-1 focus:ring-accent/40";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="mb-1.5 block text-sm text-muted">
            {t("name")}
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            placeholder={t("namePlaceholder")}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm text-muted">
            {t("email")}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder={t("emailPlaceholder")}
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="phone" className="mb-1.5 block text-sm text-muted">
            {t("phone")}
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            placeholder={t("phonePlaceholder")}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="service" className="mb-1.5 block text-sm text-muted">
            {t("service")}
          </label>
          <select
            id="service"
            name="service"
            defaultValue=""
            className={inputClass}
          >
            <option value="" disabled>
              {t("servicePlaceholder")}
            </option>
            {SERVICE_KEYS.map((key) => (
              <option key={key} value={tServices(`${key}.title`)}>
                {tServices(`${key}.title`)}
              </option>
            ))}
            <option value={t("serviceOther")}>{t("serviceOther")}</option>
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="message" className="mb-1.5 block text-sm text-muted">
          {t("message")}
        </label>
        <textarea
          id="message"
          name="message"
          rows={4}
          required
          placeholder={t("messagePlaceholder")}
          className={`${inputClass} resize-none`}
        />
      </div>

      <button
        type="submit"
        disabled={status === "loading"}
        className="group inline-flex items-center justify-center gap-2 rounded-full bg-foreground px-6 py-3.5 text-sm font-semibold text-background transition-transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-70"
      >
        {status === "loading" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("submitting")}
          </>
        ) : (
          <>
            <Send className="h-4 w-4" />
            {t("submit")}
          </>
        )}
      </button>

      {status === "success" && (
        <p className="flex items-center gap-2 rounded-xl border border-accent-2/30 bg-accent-2/10 px-4 py-3 text-sm text-foreground">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-accent-2" />
          {t("success")}
        </p>
      )}
      {status === "error" && (
        <p className="flex items-center gap-2 rounded-xl border border-accent-3/30 bg-accent-3/10 px-4 py-3 text-sm text-foreground">
          <AlertCircle className="h-4 w-4 shrink-0 text-accent-3" />
          {t("error")}
        </p>
      )}
    </form>
  );
}
