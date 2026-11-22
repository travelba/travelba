"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { SERVICE_KEYS, siteConfig } from "@/lib/site";
import { BusyBar } from "@/components/crm/BusyBar";

type Status = "idle" | "loading" | "success" | "undelivered" | "error";

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
      const json = (await res.json().catch(() => ({}))) as { delivered?: boolean };
      // L’API répond ok sans envoi quand la messagerie n’est pas configurée : ne pas promettre une réponse.
      setStatus(json.delivered === false ? "undelivered" : "success");
      form.reset();
    } catch {
      setStatus("error");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="mb-2 block text-[11px] font-medium uppercase tracking-[0.18em] text-[#5C4824]">
            {t("name")}
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            autoComplete="name"
            placeholder={t("namePlaceholder")}
            className="lux-field"
          />
        </div>
        <div>
          <label htmlFor="email" className="mb-2 block text-[11px] font-medium uppercase tracking-[0.18em] text-[#5C4824]">
            {t("email")}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder={t("emailPlaceholder")}
            className="lux-field"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <label htmlFor="phone" className="mb-2 block text-[11px] font-medium uppercase tracking-[0.18em] text-[#5C4824]">
            {t("phone")}
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder={t("phonePlaceholder")}
            className="lux-field"
          />
        </div>
        <div>
          <label htmlFor="service" className="mb-2 block text-[11px] font-medium uppercase tracking-[0.18em] text-[#5C4824]">
            {t("service")}
          </label>
          <select id="service" name="service" defaultValue="" className="lux-field">
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
        <label htmlFor="message" className="mb-2 block text-[11px] font-medium uppercase tracking-[0.18em] text-[#5C4824]">
          {t("message")}
        </label>
        <textarea
          id="message"
          name="message"
          rows={5}
          required
          placeholder={t("messagePlaceholder")}
          className="lux-field resize-y"
        />
      </div>

      <BusyBar active={status === "loading"} label={t("submitting")} />
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <button type="submit" disabled={status === "loading"} className="lux-btn w-full disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto">
          {status === "loading" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {t("submitting")}
            </>
          ) : (
            <>
              {t("submit")}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </>
          )}
        </button>
        <a
          href={`https://wa.me/${siteConfig.whatsappNumber}`}
          target="_blank"
          rel="noopener noreferrer"
          className="lux-line text-sm text-[#4E4942]"
        >
          {t("orWhatsapp")}
        </a>
      </div>

      {status === "success" && (
        <p role="status" className="flex items-start gap-2 border border-[#1F4D32]/25 bg-[#E7F0EA] px-4 py-3 text-sm text-[#1A1714]">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#1F4D32]" aria-hidden />
          {t("success")}
        </p>
      )}
      {status === "undelivered" && (
        <p role="status" className="flex items-start gap-2 border border-[#8C3A2F]/30 bg-[#F8EBE7] px-4 py-3 text-sm text-[#1A1714]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#8C3A2F]" aria-hidden />
          {t("undelivered", { email: siteConfig.contactEmail })}
        </p>
      )}
      {status === "error" && (
        <p role="status" className="flex items-start gap-2 border border-[#8C3A2F]/30 bg-[#F8EBE7] px-4 py-3 text-sm text-[#1A1714]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#8C3A2F]" aria-hidden />
          {t("error")}
        </p>
      )}
    </form>
  );
}
