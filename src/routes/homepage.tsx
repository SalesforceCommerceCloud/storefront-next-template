import React from 'react';
import Header from '@/components/mainheader/mainheader';
import HeroCarousel from '@/components/mainherocarousel/mainherocarousel';
import TopPicksSlider from '@/components/maintoppicksslider/maintoppicksslider';
import BagSection from '@/components/mainbagsection/mainbagsection';
import StartsHere from '@/components/mainstarthere/mainstarthere';
import NewAndNow from '@/components/mainnewandnow/mainnewandnow';
import Brands from '@/components/mainbrands/mainbrands';
import DressUp from '@/components/maindressup/maindressup';
import Wordrobe from '@/components/mainwordrobe/wordrobe';
import Footer from '@/components/mainfooter/mainfooter';


export default function HomePage() {
  return (
    <div className="min-h-screen bg-white font-sans">
      {/* 1. Main Header Component */}
      <Header />

     
      <HeroCarousel />

       
        <StartsHere />

        <NewAndNow />

        <Brands />
 
       <DressUp />
        
        <TopPicksSlider />

        <BagSection />

        <Wordrobe />
      
        
        <Footer />


      
    </div>
  );
}