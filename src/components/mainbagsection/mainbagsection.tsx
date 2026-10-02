import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const carouselItems = [
  {
    id: 1,
    image: "/images/new1.webp",
    title: "MOTHER'S N125 Cosmic Cowboy",
    description: "The brand's bold fall collection for Nordstrom's 125th is for the cowgirl who let her mind wander a little too far.",
    badge1: "MOTHER",
    badge2: "Celebrating 125 Years of Nordstrom"
  },
  {
    id: 2,
    image: "/images/new2.webp",
    title: "Just In: Open Edit",
    description: "Nordstrom-exclusive pieces for office days and everything after.",
    badge1: "Open Edit"
  },
  {
    id: 3,
    image: "/images/new3.webp",
    title: "Nordstrom-Exclusive Away",
    description: "Matching luggage and a crossbody, built for travel in a color that's exclusively ours.",
    badge1: "Away",
    badge2: "All Luggage & Travel"
  },
  {
    id: 4,
    image: "/images/new4.webp",
    title: "N125 Beauty Exclusives",
    description: "Limited-edition beauty favorites from top brands.",
    badge1: "Beauty New"
  },
  {
    id: 5,
    image: "/images/new5.webp",
    title: "Fall Footwear Trend",
    description: "Step into the new season with boots and loafers designed for comfort and style.",
    badge1: "Footwear"
  }
];

export default function MainBagSection() {
  const scrollRef = useRef(null);

  // Left & Right Scroll Handlers
  const scrollLeft = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: -420, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: 420, behavior: 'smooth' });
    }
  };

  return (
    <section className="w-full max-w-[1900px] mx-auto px-6 lg:px-12 py-12 bg-white font-sans select-none">
      
      {/* Header section with Title and Top-Right Navigation Buttons */}
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-xl lg:text-4xl font-bold text-gray-900 tracking-tight">
          Featured Collections
        </h2>
        
        {/* Top-Right Navigation Arrows */}
        <div className="flex items-center space-x-2">
          <button
            onClick={scrollLeft}
            className="w-10 h-10 rounded border border-gray-300 hover:border-black flex items-center justify-center bg-white text-gray-800 hover:text-black transition-colors cursor-pointer shadow-2xs"
            aria-label="Previous slide"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={scrollRight}
            className="w-10 h-10 rounded border border-gray-300 hover:border-black flex items-center justify-center bg-white text-gray-800 hover:text-black transition-colors cursor-pointer shadow-2xs"
            aria-label="Next slide"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* Carousel Container */}
      <div
        ref={scrollRef}
        className="flex gap-6 overflow-x-auto scrollbar-none scroll-smooth pb-4"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {carouselItems.map((item) => (
          <div
            key={item.id}
            className="min-w-[280px] sm:min-w-[320px] lg:min-w-[calc(33.333%-16px)] flex flex-col flex-shrink-0 group cursor-pointer"
          >
            {/* Card Image Container (Balanced height: h-[350px] sm:h-[400px] lg:h-[480px]) */}
            <div className="w-full h-[350px] sm:h-[400px] lg:h-[480px] overflow-hidden rounded-lg bg-gray-100 mb-4 flex items-center justify-center">
              <img
                src={item.image}
                alt={item.title}
                className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
              />
            </div>

            {/* Title & Description */}
            <h3 className="text-base lg:text-xl font-bold text-gray-900 mb-1.5">
              {item.title}
            </h3>
            <p className="text-xs lg:text-sm text-gray-600 mb-3 line-clamp-2 leading-relaxed">
              {item.description}
            </p>

            {/* Bottom Action Badges / Buttons */}
            <div className="flex flex-wrap items-center gap-3 mt-auto">
              <span className="px-5 py-2 bg-gray-900 text-white text-sm font-semibold rounded hover:bg-black transition-colors">
                {item.badge1}
              </span>
              {item.badge2 && (
                <span className="text-sm font-medium text-gray-900 hover:underline">
                  {item.badge2}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

    </section>
  );
}