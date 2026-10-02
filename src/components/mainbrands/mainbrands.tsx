import React from 'react';
import { ArrowRight } from 'lucide-react';

const brands = [
  {
    id: 1,
    name: "ALLIE",
    bgImage: "/images/back1.webp",
    products: [
      "/images/sub1.webp",
      "/images/sub2.webp",
      "/images/sub3.webp"
    ]
  },
  {
    id: 2,
    name: "N",
    bgImage: "/images/back2.webp",
    products: [
      "/images/sub4.webp",
      "/images/sub5.webp",
      "/images/sub6.webp"
    ]
  },
  {
    id: 3,
    name: "SUPRA",
    bgImage: "/images/back3.webp",
    products: [
      "/images/sub7.webp",
      "/images/sub8.webp",
      "/images/sub9.webp"
    ]
  }
];

export default function MainBrands() {
  return (
    <section className="w-full max-w-[1900px] mx-auto px-6 lg:px-12 py-12 bg-white font-sans select-none">
      {/* Section Header with Arrow */}
      <div className="flex items-center gap-2 mb-6 cursor-pointer group">
        <h2 className="text-xl lg:text-2xl font-bold text-gray-900 tracking-tight group-hover:underline">
          Get to know Georgian brands
        </h2>
        <span className="text-gray-900 group-hover:translate-x-1 transition-transform">
          <ArrowRight size={20} />
        </span>
      </div>

      {/* 3 Columns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {brands.map((brand) => (
          <div
            key={brand.id}
            className="relative h-[640px] rounded-xl overflow-hidden shadow-sm flex flex-col justify-between p-6 bg-gray-100"
          >
            {/* Background Image (Hover Effect Removed) */}
            <img
              src={brand.bgImage}
              alt={brand.name}
              className="absolute inset-0 w-full h-full object-cover object-center"
            />

            {/* Dark Overlay for better visibility */}
            <div className="absolute inset-0 bg-black/25"></div>

            {/* Brand Logo / Name at Top Center */}
            <div className="relative z-10 text-center pt-6">
              <h3 className="text-white text-3xl lg:text-4xl font-serif tracking-widest drop-shadow-lg">
                {brand.name}
              </h3>
            </div>

            {/* Bottom Floating Small Product Cards */}
            <div className="relative z-10 grid grid-cols-3 gap-3">
              {brand.products.map((prodImg, index) => (
                <div
                  key={index}
                  className="h-[120px] rounded-lg overflow-hidden bg-white shadow-md border border-white/20 cursor-pointer"
                >
                  <img
                    src={prodImg}
                    alt="Product"
                    className="w-full h-full object-cover object-center hover:scale-110 transition-transform duration-300"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}