import React from 'react';

const brands = [
  // Row 1
  { id: 1,  logo: "/images/logo1.webp" },
  { id: 2,  logo: "/images/logo2.webp" },
  { id: 3,  logo: "/images/logo3.webp" },
  { id: 4, logo:  "/images/logo4.webp" },
  { id: 5, logo:  "/images/logo5.webp" },
  { id: 6, logo:  "/images/logo6.webp" },
  { id: 7, logo:  "/images/logo7.webp" },
  { id: 8, logo:  "/images/logo8.webp" },
  { id: 9, logo:  "/images/logo9.webp" },
  { id: 10, logo:  "/images/logo10.webp" },
  { id: 11,  logo: "/images/logo11.webp" },
  { id: 12, logo:  "/images/logo12.webp" },

  // Row 2
  { id: 13,  logo:  "/images/logo13.webp" },
  { id: 14,  logo:  "/images/logo14.webp" },
  { id: 16, logo:  "/images/logo16.webp" },
  { id: 18,  logo:  "/images/logo18.webp" },
  { id: 23, logo:  "/images/logo21.webp" },
  { id: 24, logo:  "/images/logo22.webp" },
];

export default function MainAllBrands() {
  return (
    <section className="w-full max-w-[1600px] mx-auto px-6 lg:px-12 py-12 bg-white font-sans select-none">
      {/* Section Header */}
      <h2 className="text-xl lg:text-2xl font-bold text-gray-900 mb-8 tracking-tight">
        All brands
      </h2>

      {/* Brand Logos Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-x-6 gap-y-8 items-center">
        {brands.map((brand) => (
          <div
            key={brand.id}
            className="flex items-center justify-center h-36 w-full p-4 bg-white hover:bg-gray-50/80 rounded-xl transition-all duration-200 cursor-pointer hover:border-gray-200 shadow-xs hover:shadow-sm"
          >
            <img
              src={brand.logo}
              alt={`Brand logo ${brand.id}`}
              className="w-full h-full max-h-36 object-contain block transition-transform duration-300 hover:scale-105"
            />
          </div>
        ))}
      </div>
    </section>
  );
}