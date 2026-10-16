import type {Metadata,Viewport} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Monopoli Nusantara v4.6 — NUSA MIND',description:'Jelajahi Indonesia, bangun kota, dan kuasai papan. Main bersama 2–6 pemain atau tantang bot dalam permainan properti 2D.',icons:{icon:'/favicon.svg'}};
export const viewport:Viewport={width:'device-width',initialScale:1,viewportFit:'cover',themeColor:'#0e1928'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="id"><body>{children}</body></html>}
