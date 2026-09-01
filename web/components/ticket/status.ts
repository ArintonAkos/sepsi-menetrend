import type { Lang, Strings } from "@/lib/i18n";
import type { OpenState } from "@/lib/ticket-points";

/** "Nyitva 21:30-ig" / "Zárva · nyit szerda 05:30" / "Zárva" - the live state
 *  line shared by `TicketPointBoard` and `TicketList`. */
export function ticketStatusText(state: OpenState, lang: Lang, t: Strings): string {
  if (state.open) {
    if (!state.until) return t.ticketOpen;
    return lang === "hu" ? `${t.ticketOpen} ${state.until}-ig`
      : lang === "ro" ? `${t.ticketOpen} până la ${state.until}`
        : `${t.ticketOpen} until ${state.until}`;
  }
  if (!state.opensAt) return t.ticketClosed;
  const d = state.opensAt;
  const hh = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const sameDay = d.toDateString() === new Date().toDateString();
  return `${t.ticketClosed} · ${t.ticketOpensAt} ${sameDay ? hh : `${t.days[d.getDay()]} ${hh}`}`;
}

/** "Multi-Trans jegypénztár · egyszeri jegy, bérlet · készpénz" */
export function ticketKindLine(
  kind: "kiosk" | "shop" | "machine",
  sells: Array<"single" | "pass">,
  t: Strings,
): string {
  const k = kind === "kiosk" ? t.ticketKindKiosk : kind === "machine" ? t.ticketKindMachine : t.ticketKindShop;
  const s = sells.map((x) => (x === "pass" ? t.ticketSellsPass : t.ticketSellsSingle)).join(", ");
  return `${k} · ${s} · ${t.ticketCash}`;
}
