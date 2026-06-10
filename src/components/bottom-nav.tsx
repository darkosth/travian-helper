"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Castle, House, Radar, Route } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/villages", label: "Villages", icon: Castle },
  { href: "/", label: "Home", icon: House },
  { href: "/planner", label: "Planner", icon: Route },
  { href: "/commands", label: "Commands", icon: Radar },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4 pt-2">
      <div className="flex w-full max-w-lg items-center justify-between rounded-[1.6rem] border border-white/10 bg-stone-950/90 px-2 py-2 shadow-2xl shadow-black/40 backdrop-blur xl:max-w-xl">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-h-11 min-w-[68px] flex-col items-center justify-center rounded-2xl px-2 py-2 text-[11px] font-medium transition-colors sm:min-w-[88px] sm:px-3 sm:text-xs",
                isActive
                  ? "bg-amber-300 text-stone-950"
                  : "text-stone-300 hover:bg-white/8 hover:text-stone-100",
              )}
            >
              <Icon className="size-4" />
              <span className="mt-1">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
