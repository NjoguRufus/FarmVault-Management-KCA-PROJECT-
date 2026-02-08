import * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";

import { cn } from "@/lib/utils";

const Drawer = ({ shouldScaleBackground = true, ...props }: React.ComponentProps<typeof DrawerPrimitive.Root>) => (
  <DrawerPrimitive.Root shouldScaleBackground={shouldScaleBackground} {...props} />
);
Drawer.displayName = "Drawer";

const DrawerTrigger = DrawerPrimitive.Trigger;

const DrawerPortal = DrawerPrimitive.Portal;

const DrawerClose = DrawerPrimitive.Close;

const DrawerOverlay = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Overlay ref={ref} className={cn("fixed inset-0 z-50 bg-black/80", className)} {...props} />
));
DrawerOverlay.displayName = DrawerPrimitive.Overlay.displayName;

const MIN_DRAWER_VH = 30;
const MAX_DRAWER_VH = 90;
const DEFAULT_DRAWER_VH = 50;

const DrawerContent = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content> & {
    resizable?: boolean;
    defaultHeightVh?: number;
    minHeightVh?: number;
    maxHeightVh?: number;
  }
>(
  (
    {
      className,
      children,
      resizable = false,
      defaultHeightVh = DEFAULT_DRAWER_VH,
      minHeightVh = MIN_DRAWER_VH,
      maxHeightVh = MAX_DRAWER_VH,
      ...props
    },
    ref,
  ) => {
    const [heightVh, setHeightVh] = React.useState(defaultHeightVh);
    const startYRef = React.useRef(0);
    const startHeightRef = React.useRef(defaultHeightVh);

    const handlePointerMove = React.useCallback(
      (e: PointerEvent) => {
        const deltaY = startYRef.current - e.clientY;
        const vhPerPixel = 0.15;
        const next = Math.round(startHeightRef.current + deltaY * vhPerPixel);
        setHeightVh(Math.min(maxHeightVh, Math.max(minHeightVh, next)));
      },
      [minHeightVh, maxHeightVh],
    );

    const handlePointerUp = React.useCallback(() => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
    }, [handlePointerMove]);

    const handlePointerDown = React.useCallback(
      (e: React.PointerEvent) => {
        if (!resizable) return;
        e.preventDefault();
        startYRef.current = e.clientY;
        startHeightRef.current = heightVh;
        document.addEventListener("pointermove", handlePointerMove);
        document.addEventListener("pointerup", handlePointerUp);
      },
      [resizable, heightVh, handlePointerMove, handlePointerUp],
    );

    const style = resizable ? { height: `${heightVh}vh`, maxHeight: "90vh" } : undefined;

    return (
      <DrawerPortal>
        <DrawerOverlay />
        <DrawerPrimitive.Content
          ref={ref}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 mt-24 flex flex-col rounded-t-[10px] border bg-background",
            !resizable && "h-auto",
            className,
          )}
          style={style}
          {...props}
        >
          <div
            className="mx-auto mt-4 h-2 w-[100px] shrink-0 rounded-full bg-muted cursor-grab active:cursor-grabbing touch-none select-none"
            aria-label={resizable ? "Drag to resize or close drawer" : "Drag to move or close drawer"}
            onPointerDown={handlePointerDown}
          />
          <div className={cn("flex-1 overflow-auto", resizable && "min-h-0")}>{children}</div>
        </DrawerPrimitive.Content>
      </DrawerPortal>
    );
  },
);
DrawerContent.displayName = "DrawerContent";

const DrawerHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("grid gap-1.5 p-4 text-center sm:text-left", className)} {...props} />
);
DrawerHeader.displayName = "DrawerHeader";

const DrawerFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("mt-auto flex flex-col gap-2 p-4", className)} {...props} />
);
DrawerFooter.displayName = "DrawerFooter";

const DrawerTitle = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DrawerTitle.displayName = DrawerPrimitive.Title.displayName;

const DrawerDescription = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
DrawerDescription.displayName = DrawerPrimitive.Description.displayName;

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
};
