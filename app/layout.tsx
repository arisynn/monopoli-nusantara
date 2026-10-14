import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Monopoli Nusantara — Satu papan, sejuta cerita',description:'Jelajahi Indonesia, bangun kota, dan kuasai papan. Main bersama 2–4 pemain atau tantang bot dalam permainan properti 2.5D.',icons:{icon:'/favicon.svg'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="id"><body>{children}</body></html>}
