import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { ShoppingBag } from "lucide-react";
import { useProducts } from "@/lib/db";
import { useI18n } from "@/lib/i18n";
import { KW_MEN_NAMES, KW_WOMEN_NAMES, KW_AREAS, pickRandom } from "@/lib/kuwaitData";

const INTERVAL_MS = 120_000; // 2 minutes
const FIRST_DELAY_MS = 8_000;

export function LiveOrdersToast() {
  const { data: products = [] } = useProducts();
  const { lang } = useI18n();
  const productsRef = useRef(products);
  productsRef.current = products;
  const langRef = useRef(lang);
  langRef.current = lang;
  const recentRef = useRef<string[]>([]);

  useEffect(() => {
    let timeout: number | undefined;
    let interval: number | undefined;

    const fire = () => {
      if (document.visibilityState !== "visible") return;
      const list = productsRef.current;
      if (!list.length) return;
      // Avoid repeating the last few products
      const recent = recentRef.current;
      const pool = list.filter((p) => !recent.includes(p.id));
      const product = pickRandom(pool.length ? pool : list);
      recentRef.current = [product.id, ...recent].slice(0, Math.min(5, Math.max(1, list.length - 1)));
      const isFemale = Math.random() > 0.55;
      const name = pickRandom(isFemale ? KW_WOMEN_NAMES : KW_MEN_NAMES);
      const area = pickRandom(KW_AREAS);
      const productNameAr = product.nameAr?.trim() || product.name;
      const ar = `${name.ar} من ${area.ar} طلب ${productNameAr} قبل لحظات`;
      const en = `${name.en} from ${area.en} just ordered ${product.name}`;
      toast(
        <div className="flex items-center gap-3">
          {product.mainImage ? (
            <img
              src={product.mainImage}
              alt={product.name}
              className="h-12 w-12 shrink-0 rounded-md object-cover border border-border bg-muted"
              loading="lazy"
            />
          ) : (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-brand/15 text-brand">
              <ShoppingBag className="h-5 w-5" />
            </span>
          )}
          <div className="text-sm leading-snug" dir={langRef.current === "ar" ? "rtl" : "ltr"}>
            {langRef.current === "ar" ? ar : en}
          </div>
        </div>,
        { duration: 6000, position: "top-left" },
      );
    };

    timeout = window.setTimeout(() => {
      fire();
      interval = window.setInterval(fire, INTERVAL_MS);
    }, FIRST_DELAY_MS);

    return () => {
      if (timeout) window.clearTimeout(timeout);
      if (interval) window.clearInterval(interval);
    };
  }, []);

  return null;
}