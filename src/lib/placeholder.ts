// SVG mock product image generator — branded color block with product initial
const HSL: Record<string, string> = {
  flexitol: "hsl(202, 100%, 28%)",
  kapiva: "hsl(132, 33%, 20%)",
  nada: "hsl(340, 75%, 55%)",
  abc: "hsl(188, 62%, 44%)",
};
const SOFT: Record<string, string> = {
  flexitol: "hsl(200, 64%, 90%)",
  kapiva: "hsl(36, 47%, 92%)",
  nada: "hsl(340, 60%, 95%)",
  abc: "hsl(188, 30%, 92%)",
};

export function placeholderImage(brand: string, label: string, idx = 0): string {
  const main = HSL[brand] || "hsl(205, 67%, 36%)";
  const soft = SOFT[brand] || "hsl(36, 38%, 95%)";
  const initial = (label || "?").trim().charAt(0).toUpperCase();
  const angle = 120 + idx * 35;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 600'>
    <defs>
      <linearGradient id='g' gradientTransform='rotate(${angle})'>
        <stop offset='0%' stop-color='${soft}'/>
        <stop offset='100%' stop-color='${main}' stop-opacity='0.15'/>
      </linearGradient>
    </defs>
    <rect width='600' height='600' fill='url(#g)'/>
    <circle cx='300' cy='260' r='150' fill='${main}' opacity='0.15'/>
    <rect x='220' y='180' width='160' height='260' rx='30' fill='${main}' opacity='0.85'/>
    <rect x='250' y='150' width='100' height='40' rx='10' fill='${main}'/>
    <text x='300' y='340' text-anchor='middle' font-family='system-ui, sans-serif' font-size='110' font-weight='700' fill='white'>${initial}</text>
    <text x='300' y='540' text-anchor='middle' font-family='system-ui, sans-serif' font-size='28' fill='${main}' opacity='0.7'>${label.slice(0, 22)}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function brandLogoSvg(brand: string, name: string): string {
  const main = HSL[brand] || "hsl(205, 67%, 36%)";
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 120'>
    <rect width='400' height='120' rx='14' fill='${main}'/>
    <text x='200' y='75' text-anchor='middle' font-family='system-ui, sans-serif' font-size='40' font-weight='800' fill='white' letter-spacing='2'>${name.toUpperCase()}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

import abcLogo from "@/assets/brand-australian-bodycare.png";
import kapivaLogo from "@/assets/brand-kapiva.png";
import nadaLogo from "@/assets/brand-nada.png";
import flexitolLogo from "@/assets/brand-flexitol.png";

const BRAND_LOGO_IMAGES: Record<string, string> = {
  abc: abcLogo,
  kapiva: kapivaLogo,
  nada: nadaLogo,
  flexitol: flexitolLogo,
};

export function getBrandLogo(brand: string, name: string): { src: string; isImage: boolean } {
  const real = BRAND_LOGO_IMAGES[brand];
  if (real) return { src: real, isImage: true };
  return { src: brandLogoSvg(brand, name), isImage: false };
}

export function curemedLogoSvg(): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 120'>
    <circle cx='60' cy='60' r='38' fill='hsl(205, 67%, 36%)'/>
    <path d='M45 60 h30 M60 45 v30' stroke='white' stroke-width='8' stroke-linecap='round'/>
    <text x='115' y='75' font-family='system-ui, sans-serif' font-size='42' font-weight='800' fill='hsl(215, 28%, 17%)' letter-spacing='1'>CUREMED</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}