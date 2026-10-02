import React from 'react';

export default function MainNewAndNow() {
  return (
    <section className="w-full max-w-[1900px] mx-auto px-6 lg:px-12 py-12 bg-white font-sans select-none">

      {/* Grid Layout: Equal 4 Columns for Left Image, Center Content, and Right Image */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center justify-center">
        
        {/* Left Image Card (Full Width Expanded) */}
        <div className="lg:col-span-4 relative group overflow-hidden rounded-lg shadow-sm h-[740px] w-full">
          <img
            src="/images/image7.webp"
            alt="Fresh Fall Finds Left"
            className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
          />
        </div>

        {/* Center Content Area (Completely Centered) */}
        <div className="lg:col-span-4 flex flex-col items-center justify-center px-4 text-center">
          <h3 className="text-2xl lg:text-4xl font-bold text-gray-900 mb-3 tracking-tight">
            Offers for you
          </h3>
          <p className="text-xs lg:text-2xl text-gray-600 mb-6 leading-relaxed max-w-md">
            Find exclusive offers tailored to you across a variety of categories.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <button className="bg-black hover:bg-gray-800 text-white text-xs lg:text-xl font-medium px-7 py-5 rounded transition-all cursor-pointer shadow-sm">
              Current Offers
            </button>
          </div>
        </div>

        {/* Right Image Card (Full Width Expanded) */}
        <div className="lg:col-span-4 relative group overflow-hidden rounded-lg shadow-sm h-[740px] w-full">
          <img
            src="/images/image8.webp"
            alt="Fresh Fall Finds Right"
            className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
          />
        </div>

      </div>
    </section>
  );
}