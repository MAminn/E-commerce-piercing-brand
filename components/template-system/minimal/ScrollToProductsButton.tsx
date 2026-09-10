import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

/**
 * Floating button that appears once the user has scrolled down the landing
 * page, and smoothly scrolls back up to the products section on click.
 */
export function ScrollToProductsButton({
  targetId = "home-products",
}: {
  targetId?: string;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 500);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type='button'
      onClick={() => {
        document
          .getElementById(targetId)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
      aria-label='Scroll to products'
      className='fixed bottom-20 lg:bottom-6 end-4 z-30 w-11 h-11 rounded-full bg-gray-900 text-white flex items-center justify-center shadow-lg hover:bg-gray-800 transition-colors'>
      <ArrowUp className='w-5 h-5' />
    </button>
  );
}
