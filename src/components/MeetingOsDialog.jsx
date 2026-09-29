import React, { useState, useEffect, useRef, useCallback } from "react";
import { X, CalendarPlus, ExternalLink } from "lucide-react";
import { INK } from "../constants.js";
import { newMeetingUrl, savedMeetingFrom } from "../lib/meetingOs.js";
import { useEscape } from "./ui.jsx";

// Meeting OS's own New Meeting form, inside a dialog here, filled in from a Meeting task. The
// caller, attendees, venue and agenda are added there, and saving sends the notice and invites
// exactly as it does in Meeting OS. When the meeting is saved Meeting OS says so, the dialog
// closes and `onSaved` gets { meetingId, title, date, time, minutes } as saved there.
// Signing in happens inside the dialog: straight through with the portal sign-in, otherwise
// with the Meeting OS PIN.
export default function MeetingOsDialog({ task, onClose, onSaved }) {
  const frame = useRef(null);
  const [loaded, setLoaded] = useState(false);
  // The address is fixed when the dialog opens, so re-renders never reload the form.
  const [src] = useState(() => (task ? newMeetingUrl(task, { embed: true }) : ""));

  useEffect(() => {
    const onMessage = (event) => {
      const saved = savedMeetingFrom(event, frame.current);
      if (saved) onSaved(saved);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onSaved]);

  // Whatever was typed into the form lives only in Meeting OS until it is saved there.
  const requestClose = useCallback(() => {
    if (!loaded || window.confirm("Close Meeting OS? Anything not saved there will be lost.")) onClose();
  }, [loaded, onClose]);
  useEscape(requestClose, !!task);

  if (!task) return null;
  return (
    <div className="fixed inset-0 bg-black/45 flex items-end sm:items-center justify-center z-[70] p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Schedule in Meeting OS">
      <div className="bg-white w-full sm:max-w-3xl h-[100dvh] sm:h-[92vh] flex flex-col sm:rounded-2xl overflow-hidden shadow-[0_24px_60px_rgba(0,0,0,0.25)] rise">
        <div className="px-4 sm:px-5 py-3 border-b border-black/[0.06] flex items-center gap-3 shrink-0">
          <CalendarPlus size={18} className="shrink-0" style={{ color: INK }} />
          <div className="flex-1 min-w-0">
            <h3 className="font-serif text-lg leading-tight" style={{ color: INK }}>Schedule in Meeting OS</h3>
            <p className="text-xs text-black/45 truncate">{task.title}</p>
          </div>
          <a href={newMeetingUrl(task)} target="_blank" rel="noopener noreferrer" onClick={onClose}
            className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-black/50 hover:text-black/80 px-2 py-1.5 rounded-lg hover:bg-black/[0.04]">
            <ExternalLink size={13} /> Open in a new tab instead
          </a>
          <button onClick={requestClose} aria-label="Close" className="w-11 h-11 -m-2 inline-flex items-center justify-center rounded-full hover:bg-black/[0.04]"><X size={18} /></button>
        </div>
        <div className="relative flex-1 bg-[#F8FAFC]">
          {!loaded && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-black/45" aria-busy="true">
              <div className="w-56 h-3 rounded-full bg-black/[0.06] pulse-soft" />
              Opening Meeting OS…
            </div>
          )}
          <iframe ref={frame} src={src} title="Meeting OS — New Meeting" onLoad={() => setLoaded(true)}
            allow="clipboard-write" className="absolute inset-0 w-full h-full border-0" style={{ opacity: loaded ? 1 : 0 }} />
        </div>
        <p className="px-4 sm:px-5 py-2 text-[11px] text-black/40 border-t border-black/[0.06] shrink-0">
          Add the caller, attendees, venue and agenda, then save — the notice and invites go out from Meeting OS as usual, and this task moves to the meeting’s date and time.
        </p>
      </div>
    </div>
  );
}
