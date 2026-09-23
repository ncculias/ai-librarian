import { Routes, Route, useLocation } from "react-router-dom";

import Navbar from "./components/Navbar";
import Librarian from "./pages/Librarian";
import PictureBook from "./pages/PictureBook";
import MyStoryBook from "./pages/MyStoryBook";
import Placeholder from "./pages/Placeholder";
import Home from "./Home";
import Footer from "./components/Footer";
import AmbientMotionLayer from "./components/AmbientMotionLayer";
import { ThemeProvider } from "./theme";
// import FontSizeController from "./components/FontSizeController";

export default function App() {
  const location = useLocation();
  const isHome = location.pathname === "/";

  return (
    <ThemeProvider>
      <AmbientMotionLayer />
      {/* <FontSizeController /> */}

      {!isHome && <Navbar />}

      <div
        className={
          isHome
            ? "relative z-10"
            : "relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8"
        }
      >
        <Routes>
          <Route path="/" element={<Home />} />

          <Route path="/librarian" element={<Librarian />} />
          <Route path="/picture-book" element={<PictureBook />} />
          <Route path="/my-story-book" element={<MyStoryBook />} />

          <Route path="/search" element={<Placeholder title="搜尋圖書" />} />
          <Route
            path="/recommendations"
            element={<Placeholder title="推薦中心" />}
          />
          <Route path="/history" element={<Placeholder title="閱讀歷史" />} />
        </Routes>
      </div>

      <Footer />
    </ThemeProvider>
  );
}
