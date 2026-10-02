import { Search, User, ChevronDown } from 'lucide-react';
import { type CSSProperties, useEffect, useRef } from 'react';
import { useRouteLoaderData } from 'react-router';
import SearchBar from '@/components/header/search';
import ResponsiveNavigationMenu from '@/components/navigation-menu-mega';
import { CitySelector } from '@/components/delivery-promise/city-selector';
import CartBadge from '@/components/header/cart-badge';
import type { LoaderData as AppLoaderData } from '@/routes/_app';
 
const INK = '#111111';
const MUTED = '#4b5563';
const LINE = '#e5e7eb';
const SEARCH_INPUT_CLASS_NAME =
  'h-[48px] rounded-md border-transparent bg-[#f0f3f5] w-4xl px-4 pl-10 text-[18px] shadow-none placeholder:text-[#64748b] focus-visible:border-transparent focus-visible:ring-black';
const headerStyle = {
  background: '#fff',
  color: INK,
  '--header-background': '#fff',
  '--header-foreground': INK,
  '--header-border': LINE,
  '--header-menu-background': '#fff',
  '--header-menu-foreground': INK,
  '--header-menu-border': LINE,
  '--header-menu-hover-background': '#f0f3f5',
  '--header-menu-hover-foreground': INK,
  '--header-menu-active-background': '#f0f3f5',
  '--header-menu-icon': MUTED,
} as CSSProperties;

const CATEGORY_LINKS = [
  { label: 'Men', aliases: ['men', 'mens'] },
  { label: 'New', aliases: ['new', 'newarrival', 'newarrivals', 'newandnow'] },
  { label: 'Women', aliases: ['women', 'womens'] },
  { label: 'Kids', aliases: ['kid', 'kids', 'child', 'children'] },
  { label: 'Online Exclusive', aliases: ['onlineexclusive', 'onlineexclusives'] },
  { label: 'Sports', aliases: ['sport', 'sports'] },
  { label: 'Beauty', aliases: ['beauty', 'selfcare', 'selfcareandbeauty'] },
  { label: 'Home', aliases: ['home', 'house'] },
  { label: 'Discount', aliases: ['discount', 'discounts', 'sale', 'clearance'] },
];

const iconStyle = (color: string) => ({ color, stroke: color, fill: 'none', display: 'block' });
 
type HeaderProps = {
  root?: AppLoaderData['root'];
  defer?: AppLoaderData['subs'];
  embeddedComponent?: AppLoaderData['megaMenuComponent'];
};

export default function Header({
  root: rootProp,
  defer: deferProp,
  embeddedComponent: embeddedComponentProp,
}: HeaderProps) {
  const headerRef = useRef<HTMLElement>(null);
  const appLoaderData = useRouteLoaderData<AppLoaderData>('routes/_app');
  const root = rootProp ?? appLoaderData?.root;
  const defer = deferProp ?? appLoaderData?.subs;
  const embeddedComponent = embeddedComponentProp ?? appLoaderData?.megaMenuComponent;

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;

    const updateHeaderHeight = () => {
      const height = `${header.offsetHeight}px`;
      header.style.setProperty('--header-height', height);
      document.documentElement.style.setProperty('--header-height', height);
    };

    updateHeaderHeight();
    const observer = new ResizeObserver(updateHeaderHeight);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  return (
    <header ref={headerRef} className="sticky top-0 z-50 w-full font-sans" style={headerStyle}>
      {/* 1. Announcement Bar */}
      <div
        className="text-[13px] md:text-[18px] py-3 px-4 lg:px-6 flex items-center justify-center relative w-full"
        style={{ background: '#000', color: '#fff' }}
      >
        <div className="text-center">
          Shipping outside of the U.S.?{' '}
          <a href="#international-shipping" style={{ color: '#fff', textDecoration: 'underline' }}>
            Learn About International Shopping
          </a>
        </div>
        <div className="hidden lg:flex items-center gap-1.5 text-[14px] absolute right-6" style={{ color: '#fff' }}>
          <span>🇵🇰</span> <span className="font-medium">Pakistan</span>
        </div>
      </div>
 
      {/* 2. Main Header Bar */}
      <div className="w-full px-4 md:px-8 lg:px-12 py-4 flex items-center justify-between gap-4 lg:gap-8">
        <a
          href="/"
          className="flex-shrink-0 text-[22px] md:text-[28px] lg:text-[32px] font-bold tracking-[0.1em]"
          style={{ color: INK, textDecoration: 'none' }}
        >
          DRESSUP.GE
        </a>
 
        <div className="hidden md:flex flex-1 max-w-5xl">
          <SearchBar inputClassName={SEARCH_INPUT_CLASS_NAME} />
        </div>
 
        <div className="flex items-center gap-5 lg:gap-8 flex-shrink-0">
          <CitySelector className="hidden md:flex" />
          <a
            href="/account/login"
            className="flex items-center gap-1"
            style={{ color: INK, textDecoration: 'none' }}
          >
            <User size={22} strokeWidth={1.5} style={iconStyle(INK)} />
            <span className="text-[14px] font-medium hidden md:inline">Sign In</span>
            <ChevronDown size={14} className="hidden md:inline" style={iconStyle(MUTED)} />
          </a>
 
          {/* Real basket count + mini cart (opens after add to cart) */}
          <CartBadge />
        </div>
      </div>
 
      {/* Mobile search */}
      <div className="md:hidden px-4 pb-3 space-y-2">
        <CitySelector />
        <SearchBar inputClassName={SEARCH_INPUT_CLASS_NAME} />
      </div>
 
      {/* 3. Sub Navigation */}
      <div
        className="w-full px-4 md:px-8 lg:px-16 [&_[data-slot=navigation-menu]]:w-full [&_[data-slot=navigation-menu]]:max-w-none [&_[data-slot=navigation-menu-list]]:w-full [&_[data-slot=navigation-menu-list]]:justify-around"
        style={{ borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}` }}
      >
        <ResponsiveNavigationMenu
          resolve={root}
          defer={defer}
          embeddedComponent={embeddedComponent}
          categoryLabels={CATEGORY_LINKS}
        />
      </div>
    </header>
  );
}