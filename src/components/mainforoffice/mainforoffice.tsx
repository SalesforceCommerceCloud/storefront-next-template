import React from 'react';

export default function MainForOffice() {
  return (
    <section className="w-full max-w-[1900px] mx-auto py-12 bg-[#F9F9F9] font-sans select-none">
      {/* Grid Layout: Left Content (3 cols + left margin) & Right Large Image (9 cols for ~70-75% width) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
        
        {/* Left Side Content */}
        <div className="lg:col-span-4 lg:col-start-2 flex flex-col justify-center px-6 lg:px-0">
          <h2 className="text-2xl lg:text-4xl font-bold text-gray-900 mb-4 tracking-tight">
            DRESSUP HOME

          </h2>
          <p className="text-base lg:text-lg text-gray-600 mb-8 leading-relaxed">
            Details for your space.
          </p>
          <div className="flex">
            <button className="bg-[#2a303c] hover:bg-black text-white text-sm font-semibold px-8 py-4 rounded-full transition-all cursor-pointer shadow-md whitespace-nowrap">
              Discover Products
            </button>
          </div>
        </div>

        {/* Right Side Large Image (~75% width stretching to the right edge) */}
        <div className="lg:col-span-7 relative group overflow-hidden rounded-2xl lg:rounded-3xl h-[480px] lg:h-[580px] bg-gray-100 shadow-md w-full">
          <img
            src="/images/web-banner.webp"
            alt="For the office"
            className="w-full h-full object-cover object-center"
          />
        </div>

      </div>
    </section>
  );
}