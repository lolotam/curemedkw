import { useEffect, useState } from "react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";
import { ProductCard } from "@/components/site/ProductCard";
import { useFeaturedProducts } from "@/lib/db";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function FeaturedProductsCarousel() {
  const { t, lang } = useI18n();
  const { data: products = [] } = useFeaturedProducts();
  const [api, setApi] = useState<CarouselApi>();
  const [selected, setSelected] = useState(0);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!api) return;
    setCount(api.scrollSnapList().length);
    setSelected(api.selectedScrollSnap());
    const onSelect = () => setSelected(api.selectedScrollSnap());
    api.on("select", onSelect);
    api.on("reInit", () => {
      setCount(api.scrollSnapList().length);
      setSelected(api.selectedScrollSnap());
    });
    return () => {
      api.off("select", onSelect);
    };
  }, [api]);

  if (!products.length) return null;

  return (
    <section id="featured" className="py-16 md:py-24 bg-gradient-to-b from-background to-muted/30">
      <div className="w-full px-4 md:px-8">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <h2 className="text-3xl md:text-4xl font-bold">{t("spotlight.title")}</h2>
          <p className="mt-3 text-muted-foreground">{t("featured.subtitle")}</p>
        </div>

        <Carousel
          setApi={setApi}
          opts={{
            align: "start",
            loop: products.length > 4,
            direction: lang === "ar" ? "rtl" : "ltr",
          }}
          className="relative"
        >
          <CarouselContent className="-ml-4">
            {products.map((p) => (
              <CarouselItem
                key={p.id}
                className="pl-4 basis-1/2 sm:basis-1/3 lg:basis-1/4 xl:basis-1/5"
              >
                <ProductCard product={p} />
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className="hidden md:flex -left-4" />
          <CarouselNext className="hidden md:flex -right-4" />
        </Carousel>

        {count > 1 && (
          <div className="mt-6 flex items-center justify-center gap-2">
            {Array.from({ length: count }).map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Go to slide ${i + 1}`}
                onClick={() => api?.scrollTo(i)}
                className={cn(
                  "h-2 rounded-full transition-all",
                  i === selected ? "w-6 bg-brand" : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50",
                )}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
