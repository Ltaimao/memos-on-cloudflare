import { cn } from "@/lib/utils";
import type { Attachment } from "@/types/proto/api/v1/attachment_service_pb";
import { getAttachmentThumbnailUrl, getAttachmentThumbnailSmUrl, getAttachmentType, getAttachmentUrl } from "@/utils/attachment";

interface AttachmentCardProps {
  attachment: Attachment;
  onClick?: () => void;
  className?: string;
}

const AttachmentCard = ({ attachment, onClick, className }: AttachmentCardProps) => {
  const attachmentType = getAttachmentType(attachment);
  const sourceUrl = getAttachmentUrl(attachment);

  if (attachmentType === "image/*") {
    return (
      <img
        src={getAttachmentThumbnailUrl(attachment)}
        srcSet={`${getAttachmentThumbnailSmUrl(attachment)} 200w, ${getAttachmentThumbnailUrl(attachment)} 400w`}
        sizes="(max-width: 640px) 150px, 300px"
        alt={attachment.filename}
        className={cn("w-full h-full object-cover rounded-lg cursor-pointer", className)}
        onClick={onClick}
        onError={(e) => {
          const target = e.currentTarget;
          if (target.src.includes("?thumbnail")) {
            target.src = sourceUrl;
          }
        }}
        decoding="async"
        loading="lazy"
      />
    );
  }

  if (attachmentType === "video/*") {
    return <video src={sourceUrl} className={cn("w-full h-full object-cover rounded-lg", className)} controls preload="metadata" />;
  }

  if (attachmentType === "audio/*") {
    return <audio src={sourceUrl} className={cn("w-full rounded-lg", className)} controls preload="metadata" />;
  }

  return null;
};

export default AttachmentCard;
