import type { DeauvillePhoneBlock } from "@/lib/crm/deauville-preview";

function Bubble({ block }: { block: Extract<DeauvillePhoneBlock, { kind: "text" }> }) {
  const mine = block.from === "client";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-snug shadow-sm ${
          mine ? "rounded-br-sm bg-[#d9fdd3] text-[#111b21]" : "rounded-bl-sm bg-white text-[#111b21]"
        }`}
      >
        <p className="whitespace-pre-wrap">{block.text}</p>
        <p className={`mt-1 text-right text-[10px] text-[#667781]`}>
          {block.time}
          {mine ? "  ✓✓" : ""}
        </p>
      </div>
    </div>
  );
}

function Carousel({ block }: { block: Extract<DeauvillePhoneBlock, { kind: "carousel" }> }) {
  return (
    <div className="space-y-1">
      <Bubble block={{ kind: "text", from: "agence", text: block.text, time: block.time }} />
      <div className="flex gap-2 overflow-x-auto pb-1 pl-1">
        {block.cards.map((card) => (
          <article key={card.title} className="w-[210px] shrink-0 overflow-hidden rounded-xl bg-white shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={card.photo} alt="" className="aspect-[16/10] w-full object-cover" />
            <div className="space-y-2 p-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8c7350]">{card.title}</p>
              <p className="text-[12px] leading-snug text-[#111b21]">{card.body}</p>
              <div className="grid grid-cols-2 gap-1">
                <p
                  className={`rounded-full py-1 text-center text-[11px] font-semibold ${
                    block.pressed ? "bg-[#075e54] text-white" : "bg-[#f0f2f5] text-[#075e54]"
                  }`}
                >
                  J&apos;accepte
                </p>
                <p className="rounded-full bg-[#f0f2f5] py-1 text-center text-[11px] font-semibold text-[#075e54]">Je refuse</p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

/** Conversation téléphone, données fictives. Rien n’est envoyé. */
export function RestaurantPhone({ caption, blocks }: { caption: string; blocks: DeauvillePhoneBlock[] }) {
  return (
    <figure className="mx-auto w-full max-w-[390px]">
      <div className="overflow-hidden rounded-[2.2rem] border-[10px] border-[#0B192C] bg-[#efeae2] shadow-[0_18px_40px_rgba(11,25,44,0.18)]">
        <div className="flex items-center justify-between bg-[#075e54] px-4 pb-3 pt-3 text-white">
          <div>
            <p className="text-[11px] text-white/70">16:02</p>
            <p className="font-semibold leading-tight">Travel BA</p>
            <p className="text-[11px] text-white/80">La Conciergerie</p>
          </div>
          <p className="rounded-full bg-white/15 px-2 py-1 text-[10px] font-semibold">WhatsApp</p>
        </div>
        <div className="space-y-3 px-3 py-4">
          {blocks.map((block, index) =>
            block.kind === "text" ? <Bubble key={`${block.time}-${index}`} block={block} /> : <Carousel key={`${block.name}-${index}`} block={block} />
          )}
        </div>
      </div>
      <figcaption className="mt-3 text-center text-sm text-[#5c564c]">{caption}</figcaption>
    </figure>
  );
}
