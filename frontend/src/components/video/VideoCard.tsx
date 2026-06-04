"use client";

import { useEffect, useState } from "react";
import { VideoCardData, formatDuration, formatNumber, transcriptSourceLabel } from "@/lib/api";
import { Eye, Heart, MessageCircle, Clock, Calendar, Users, Hash, Youtube, Instagram, Mic, Lock } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface VideoCardProps {
  video: VideoCardData;
}

export default function VideoCard({ video }: VideoCardProps) {
  const isYouTube = video.platform === "youtube";
  const isInstagram = video.platform === "instagram";
  const engagementColor =
    video.engagement_rate >= 5 ? "text-green-400" :
    video.engagement_rate >= 2 ? "text-yellow-400" : "text-red-400";
  const transcriptInfo = transcriptSourceLabel(video.transcript_source);

  const [thumbnailSrc, setThumbnailSrc] = useState<string>("");
  const [thumbLoading, setThumbLoading] = useState(true);
  const [thumbError, setThumbError] = useState(false);

  useEffect(() => {
    setThumbnailSrc("");
    setThumbLoading(true);
    setThumbError(false);

    if (isYouTube && video.thumbnail) {
      setThumbnailSrc(video.thumbnail);
      setThumbLoading(false);
    } else if (isInstagram && video.url) {
      fetch(`${API_URL}/api/proxy/instagram-thumb?url=${encodeURIComponent(video.url)}`)
        .then(r => r.json())
        .then(data => {
          if (data.thumbnail_data) {
            setThumbnailSrc(data.thumbnail_data);
          }
          setThumbLoading(false);
        })
        .catch(() => {
          setThumbLoading(false);
          setThumbError(true);
        });
    } else {
      setThumbLoading(false);
    }
  }, [video.url, video.thumbnail, isYouTube, isInstagram]);

  const isStatHidden = (val: number) => isInstagram && val === 0;

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
        <div className="flex items-center gap-1.5">
          {isYouTube
            ? <Youtube size={14} className="text-red-500" />
            : <Instagram size={14} className="text-pink-500" />}
          <span className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: isYouTube ? "#FF0000" : "#E1306C" }}>
            {video.platform}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {video.transcript_source !== "none" && (
            <span className={`text-[10px] flex items-center gap-1 ${transcriptInfo.color}`}>
              <Mic size={9} />
              {transcriptInfo.label}
            </span>
          )}
          <span className="text-xs font-bold text-white bg-[var(--accent)] px-2 py-0.5 rounded">
            Video {video.video_id}
          </span>
        </div>
      </div>

      {/* Thumbnail — fixed 9:16 ratio for Shorts/Reels */}
      <div className="relative bg-black flex-shrink-0" style={{ paddingTop: "100%" }}>
        <div className="absolute inset-0">
          {thumbLoading ? (
            <div className="w-full h-full flex items-center justify-center animate-pulse bg-[var(--border)]">
              <span className="text-xs text-[var(--text-secondary)]">Loading...</span>
            </div>
          ) : thumbnailSrc && !thumbError ? (
            <img
              src={thumbnailSrc}
              alt={video.title}
              className="w-full h-full object-cover"
              onError={() => setThumbError(true)}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-[var(--text-secondary)] gap-2">
              {isInstagram
                ? <Instagram size={40} className="text-pink-500 opacity-40" />
                : <Eye size={40} />}
              <span className="text-xs opacity-50">No thumbnail</span>
            </div>
          )}
          {video.duration > 0 && (
            <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded font-mono">
              {formatDuration(video.duration)}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-3 flex flex-col gap-2 flex-1 overflow-y-auto scrollbar-thin">
        {/* Title */}
        <h3 className="text-sm font-semibold text-white leading-snug line-clamp-2">
          {video.title}
        </h3>

        {/* Creator */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
            <Users size={12} />
            <span className="font-medium text-white truncate max-w-[120px]">{video.creator}</span>
          </div>
          {video.creator_followers && video.creator_followers > 0 ? (
            <span className="text-xs text-[var(--text-secondary)]">
              {formatNumber(video.creator_followers)} followers
            </span>
          ) : (
            <HiddenBadge label="followers" show={isInstagram} />
          )}
        </div>

        {/* Engagement Rate */}
        <div className="bg-[var(--bg-secondary)] rounded px-3 py-2 flex items-center justify-between">
          <span className="text-xs text-[var(--text-secondary)]">Engagement Rate</span>
          {video.engagement_rate > 0 ? (
            <span className={`text-lg font-bold ${engagementColor}`}>
              {video.engagement_rate.toFixed(2)}%
            </span>
          ) : (
            <HiddenBadge label="hidden by Instagram" show={isInstagram} inline />
          )}
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-1.5">
          <StatBox
            icon={<Eye size={11} />}
            label="Views"
            value={formatNumber(video.views)}
            hidden={isStatHidden(video.views)}
          />
          <StatBox
            icon={<Heart size={11} />}
            label="Likes"
            value={formatNumber(video.likes)}
            hidden={isStatHidden(video.likes)}
          />
          <StatBox
            icon={<MessageCircle size={11} />}
            label="Comments"
            value={formatNumber(video.comments)}
            hidden={isStatHidden(video.comments)}
          />
        </div>

        {/* Reshares — Instagram specific note */}
        {isInstagram && (
          <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-secondary)] bg-[var(--bg-secondary)] rounded px-2 py-1.5">
            <Lock size={9} className="text-orange-400 flex-shrink-0" />
            <span>Reshares & some stats hidden by Instagram's API</span>
          </div>
        )}

        {/* Hook */}
        {video.hook && video.hook !== "[Hook not available]" && (
          <div className="bg-[var(--bg-secondary)] rounded px-2.5 py-2">
            <p className="text-[10px] text-[var(--text-secondary)] mb-1 flex items-center gap-1">
              <Mic size={9} />
              Hook (first 10s)
            </p>
            <p className="text-xs text-white italic line-clamp-2">"{video.hook}"</p>
          </div>
        )}

        {/* Meta */}
        <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)]">
          <div className="flex items-center gap-1">
            <Calendar size={11} />
            <span>{video.upload_date || "Unknown"}</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock size={11} />
            <span>{formatDuration(video.duration)}</span>
          </div>
        </div>

        {/* Hashtags */}
        {video.hashtags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {video.hashtags.slice(0, 5).map((tag, i) => (
              <span key={i}
                className="text-xs bg-[var(--bg-secondary)] text-[var(--accent)] px-1.5 py-0.5 rounded flex items-center gap-0.5">
                <Hash size={9} />
                {tag.replace("#", "")}
              </span>
            ))}
            {video.hashtags.length > 5 && (
              <span className="text-xs text-[var(--text-secondary)]">
                +{video.hashtags.length - 5}
              </span>
            )}
          </div>
        )}

        <a href={video.url} target="_blank" rel="noopener noreferrer"
          className="text-xs text-[var(--accent)] hover:underline truncate block mt-auto">
          {video.url}
        </a>
      </div>
    </div>
  );
}

function HiddenBadge({ label, show, inline }: { label: string; show: boolean; inline?: boolean }) {
  if (!show) return null;
  return (
    <span className={`flex items-center gap-1 text-[10px] text-orange-400 ${inline ? "" : ""}`}>
      <Lock size={9} />
      {label}
    </span>
  );
}

function StatBox({
  icon, label, value, hidden
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hidden?: boolean;
}) {
  return (
    <div className="bg-[var(--bg-secondary)] rounded px-2 py-1.5 text-center">
      <div className="flex items-center justify-center gap-1 text-[var(--text-secondary)] mb-0.5">
        {icon}
        <span className="text-[10px]">{label}</span>
      </div>
      {hidden ? (
        <div className="flex items-center justify-center gap-1">
          <Lock size={9} className="text-orange-400" />
          <span className="text-[10px] text-orange-400">Hidden</span>
        </div>
      ) : (
        <div className="text-sm font-semibold text-white">{value}</div>
      )}
    </div>
  );
}
