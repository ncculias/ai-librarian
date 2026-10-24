import { useLayoutEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/** 換頁時把捲動位置歸零；瀏覽器上一頁／下一頁（POP）不動，讓瀏覽器自己還原位置。 */
export default function ScrollToTop() {
  const { pathname } = useLocation();
  const navType = useNavigationType();

  useLayoutEffect(() => {
    if (navType !== "POP") window.scrollTo(0, 0);
  }, [pathname, navType]);

  return null;
}
