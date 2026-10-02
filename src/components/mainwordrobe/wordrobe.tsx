import React from 'react';

export default function Wordrobe() {
  return (
    <section className="w-full max-w-[1900px] mx-auto px-6 lg:px-12 py-8 bg-white font-sans select-none">
      {/* Banner Container */}
      <div className="relative w-full h-[420px] sm:h-[500px] lg:h-[600px] rounded-xl overflow-hidden shadow-sm flex flex-col justify-center items-center text-center p-8 sm:p-12 lg:p-16">
        
        {/* Background Image with Dark Overlay for Text Readability */}
        <div className="absolute inset-0 z-0">
          <img
            src="/images/wordrobe1.webp" 
            alt="Worn in, never worn out"
            className="w-full h-full object-cover object-center"
          />
          {/* Gradient/Dark Overlay */}
          <div className="absolute inset-0 bg-black/40"></div>
        </div>

        {/* Center Content: Title, Description & Button */}
        <div className="relative z-10 max-w-xl mx-auto flex flex-col items-center">
          <h1 className="text-3xl sm:text-4xl lg:text-4xl font-bold text-white tracking-tight mb-4 leading-tight">
            Worn in, never worn out
          </h1>
          <p className="text-sm sm:text-sm text-white mb-6 leading-relaxed">
            Discover the boots built to outlast the trend cycle, one scuff at a time.
          </p>
          <button className="px-6 py-3 bg-white text-gray-900 font-medium text-lg rounded hover:bg-gray-100 transition-colors shadow-md cursor-pointer">
            Shop Now
          </button>
        </div>

      </div>
    </section>
  );
}