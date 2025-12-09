import { useEffect, useState } from 'react';

export default function useIsMobile(breakpoint: number = 900): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < breakpoint);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [breakpoint]);

  return isMobile;
}
