import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  type ViewStyle,
  type ImageSourcePropType,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { Avatar } from "@/components/ui/Avatar";
import { PublicationMedia } from "@/components/ui/PublicationMedia";

const GOLD   = "#C9A24A";
const DARK   = "#111111";
const BORDER = "#EADFCB";

export interface BadgeSpec {
  label?: string;
  icon?: string;
  color: string;
  textColor?: string;
}

export interface PublicationCardProps {
  imageUrls?: string[] | null;
  /** Legacy single-image field. It remains supported for existing callers/data. */
  imageSource?: string | null;
  category?: string;
  categoryColor?: string;
  badges?: BadgeSpec[];
  timeLabel?: string;
  title: string;
  body?: string;
  authorName: string;
  authorPhotoURL?: string | null;
  onPress?: () => void;
  /** Called when the author avatar is tapped — only fires when authorPhotoURL is set. */
  onAuthorAvatarPress?: () => void;
  /** Called when the author name is tapped. */
  onAuthorPress?: () => void;
  footer?: React.ReactNode;
  topRight?: React.ReactNode;
  style?: ViewStyle;
}

export function PublicationCard({
  imageUrls,
  imageSource,
  category,
  categoryColor = "rgba(17,17,17,0.62)",
  badges = [],
  timeLabel,
  title,
  body,
  authorName,
  authorPhotoURL,
  onPress,
  onAuthorAvatarPress,
  onAuthorPress,
  footer,
  topRight,
  style,
}: PublicationCardProps) {
  const resolvedImageUrls = imageUrls ?? (imageSource ? [imageSource] : []);

  const hasBadgeRow =
    !!category || badges.length > 0 || !!timeLabel;

  const content = (
    <View style={[s.outer, style]}>
      <PublicationMedia imageUrls={resolvedImageUrls} authorName={authorName} />

      {hasBadgeRow || topRight ? (
        <View style={s.badgeLayer}>
          {hasBadgeRow ? (
            <View style={s.badgeRow}>
              {category ? (
                <View style={[s.pill, { backgroundColor: categoryColor }]}>
                  <Text style={s.pillText}>{category}</Text>
                </View>
              ) : null}
              {badges.map((b, i) => (
                <View key={i} style={[s.pill, { backgroundColor: b.color }]}>
                  {b.icon ? (
                    <Feather name={b.icon as never} size={10} color={b.textColor ?? "#fff"} />
                  ) : null}
                  {b.label ? (
                    <Text style={[s.pillText, b.textColor ? { color: b.textColor } : undefined]}>
                      {b.label}
                    </Text>
                  ) : null}
                </View>
              ))}
              {timeLabel ? <Text style={s.timeOverlay}>{timeLabel}</Text> : null}
            </View>
          ) : null}
          {topRight ? <View style={s.topRight}>{topRight}</View> : null}
        </View>
      ) : null}

      {/* ── Body ── */}
      <View style={s.body}>
        {title ? (
          <Text style={s.title}>{title}</Text>
        ) : null}
        {body ? (
          <Text style={s.bodyText}>{body}</Text>
        ) : null}
        <View style={s.authorRow}>
          <Avatar
            name={authorName}
            size={22}
            photoURL={authorPhotoURL ?? undefined}
            onPress={onAuthorAvatarPress}
          />
          {onAuthorPress ? (
            <TouchableOpacity onPress={onAuthorPress} activeOpacity={0.7} style={{ flex: 1 }}>
              <Text style={s.authorName} numberOfLines={1}>{authorName}</Text>
            </TouchableOpacity>
          ) : (
            <Text style={s.authorName} numberOfLines={1}>{authorName}</Text>
          )}
          {!footer ? (
            <Feather name="arrow-right" size={13} color={GOLD} style={{ marginLeft: "auto" }} />
          ) : null}
        </View>
        {footer ? <View style={s.footerWrap}>{footer}</View> : null}
      </View>
    </View>
  );

  return onPress ? (
    <TouchableOpacity activeOpacity={0.86} onPress={onPress}>
      {content}
    </TouchableOpacity>
  ) : (
    content
  );
}

const s = StyleSheet.create({
  outer: {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#fff",
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: BORDER,
  },
  badgeLayer: { minHeight: 0, position: "relative" },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
    flexWrap: "wrap",
    minWidth: 0,
    backgroundColor: "#FFFDF8",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
  },
  pillText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  timeOverlay: {
    marginLeft: "auto",
    flexShrink: 1,
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.85)",
  },
  topRight: {
    position: "absolute",
    top: 10,
    right: 10,
  },
  body: {
    padding: 14,
    gap: 8,
    minWidth: 0,
  },
  title: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: DARK,
    lineHeight: 24,
  },
  bodyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#555",
    lineHeight: 21,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  authorName: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "#666",
    flex: 1,
  },
  footerWrap: {
    marginTop: 4,
  },
});
