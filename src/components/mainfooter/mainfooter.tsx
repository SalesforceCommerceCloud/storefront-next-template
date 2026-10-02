import React from 'react';
import { Facebook, Instagram, Youtube, Linkedin, Disc as Tiktok } from 'lucide-react';
import Switchers from '@/components/footer/switchers';

export default function MainFooter() {
  return (
    <footer className="w-full bg-[#FAFAFA] border-t border-gray-200 pt-20 pb-16 font-sans select-none text-gray-800">
      <div className="max-w-[1600px] mx-auto px-6 lg:px-16">
        
        {/* 4 Columns Layout with comfortable spacing */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-16">
          
          {/* Column 1: Food & Drink */}
          <div className="flex flex-col space-y-4">
            <h3 className="font-bold text-gray-900 text-base lg:text-lg tracking-wide mb-3 uppercase">
              FOOD & DRINK
            </h3>
            <a href="#" className="text-base text-gray-600 hover:text-black transition-colors">Registration</a>
            <a href="#" className="text-base text-gray-600 hover:text-black transition-colors">Payment</a>
            <a href="#" className="text-base text-gray-600 hover:text-black transition-colors">Pay later</a>
            <a href="#" className="text-base text-gray-600 hover:text-black transition-colors">Delivery</a>
            <a href="#" className="text-base text-gray-600 hover:text-black transition-colors">Checkout</a>
            <a href="#" className="text-base text-gray-600 hover:text-black transition-colors">Service 'Moirge'</a>
            <a href="#" className="text-base text-gray-600 hover:text-black transition-colors">Gift wrapping</a>
            <a href="#" className="text-base text-gray-600 hover:text-black transition-colors">Exchange and return policies on Dressup.ge</a>
          </div>

          {/* Column 2: Information */}
          <div className="flex flex-col space-y-4">
            <h3 className="font-bold text-gray-900 text-base lg:text-lg tracking-wide mb-3 uppercase">
              INFORMATION
            </h3>
            <a href="#" className="text-base text-gray-600 hover:text-black transition-colors">Brands</a>
            <a href="#" className="text-base text-gray-600 hover:text-black transition-colors">Gift card</a>
            <a href="#" className="text-base text-gray-600 hover:text-black transition-colors">Dressup card</a>
            <a href="#" className="text-base text-gray-600 hover:text-black transition-colors">Collab X Dressup.ge</a>
            <a href="#" className="text-base text-gray-600 hover:text-black transition-colors">Product care rules</a>
            <a href="#" className="text-base text-gray-600 hover:text-black transition-colors">Terms and Conditions of Use</a>
            <a href="#" className="text-base text-gray-600 hover:text-black transition-colors">Privacy Policy</a>
          </div>

          {/* Column 3: Older Food */}
          <div className="flex flex-col space-y-4">
            <h3 className="font-bold text-gray-900 text-base lg:text-lg tracking-wide mb-3 uppercase">
              OLDER FOOD
            </h3>
            <a href="#" className="text-base text-gray-600 hover:text-black transition-colors">About Dressup Group</a>
            <a href="#" className="text-base text-gray-600 hover:text-black transition-colors">History of the Dressup Group</a>
            <a href="#" className="text-base text-gray-600 hover:text-black transition-colors">Dressup stores</a>
            <a href="#" className="text-base text-gray-600 hover:text-black transition-colors">Exchange and return policies in stores</a>
            <a href="#" className="text-base text-gray-600 hover:text-black transition-colors">Blog</a>
          </div>

          {/* Column 4: Contact & Apps */}
          <div className="flex flex-col space-y-6">
            <div>
              <h3 className="font-bold text-gray-900 text-base lg:text-lg tracking-wide mb-3 uppercase">
                CONTACT
              </h3>
              <p className="text-base text-gray-900 font-semibold mb-1.5">(+995) 032 2 38 48 68</p>
              <p className="text-sm text-gray-600 break-all leading-relaxed">info@dressup.ge | corporate@dressup.ge</p>
            </div>

            {/* Social Media Icons */}
            <div className="flex items-center space-x-3.5 pt-1">
              <a href="#" className="w-10 h-10 rounded-full bg-gray-200/80 hover:bg-black hover:text-white flex items-center justify-center transition-all">
                <Facebook size={28} />
              </a>
              <a href="#" className="w-10 h-10 rounded-full bg-gray-200/80 hover:bg-black hover:text-white flex items-center justify-center transition-all">
                <Instagram size={28} />
              </a>
              <a href="#" className="w-10 h-10 rounded-full bg-gray-200/80 hover:bg-black hover:text-white flex items-center justify-center transition-all">
                <Tiktok size={28} />
              </a>
              <a href="#" className="w-10 h-10 rounded-full bg-gray-200/80 hover:bg-black hover:text-white flex items-center justify-center transition-all">
                <Youtube size={28} />
              </a>
              <a href="#" className="w-10 h-10 rounded-full bg-gray-200/80 hover:bg-black hover:text-white flex items-center justify-center transition-all">
                <Linkedin size={18} />
              </a>
            </div>

            {/* App Download Section */}
            <div className="pt-2">
              <h4 className="font-bold text-gray-900 text-sm lg:text-base tracking-wide mb-3 uppercase">
                THE END OF THE DAY
              </h4>
              <div className="flex flex-col sm:flex-row lg:flex-col gap-3">
                <a href="#" className="inline-block">
                  <img 
                    src="/images/apple-pay-badge.png" 
                    alt="App Store" 
                    className="h-11 object-contain"
                  />
                </a>
                <a href="#" className="inline-block">
                  <img 
                    src="google-pay-bage.png" 
                    alt="Google Play" 
                    className="h-11 object-contain"
                  />
                </a>
              </div>
            </div>

          </div>

        </div>

        {/* Language and currency */}
        <div className="mt-12 border-t border-gray-200 pt-8">
          <Switchers />
        </div>

      </div>
    </footer>
  );
}