'use client';
export type Feedback={text:string;tone?:string;onOpen:()=>void}|null;
/** Reserved HUD line; never a fixed overlay, backdrop or turn lock. */
export default function InlineFeedback({feedback}:{feedback:Feedback}){
 return <span className="inline-feedback-slot">{feedback&&<button type="button" className={`inline-feedback feedback-${feedback.tone||'info'}`} onClick={feedback.onOpen} title={feedback.text} aria-label={feedback.text}><span role="status">{feedback.text}</span></button>}</span>;
}
