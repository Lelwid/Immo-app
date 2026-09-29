import Image from "next/image";

type NexbailBrandProps = {
  alt?: string;
  className?: string;
  priority?: boolean;
  tone?: "auto" | "dark" | "light";
  variant?: "horizontal" | "monogram";
};

export function NexbailBrand({
  alt = "Nexbail",
  className = "h-10 w-[123px]",
  priority = false,
  tone = "auto",
  variant = "horizontal",
}: NexbailBrandProps) {
  if (variant === "monogram") {
    return (
      <span className={`relative block shrink-0 ${className}`}>
        <Image
          alt={alt}
          className="object-contain"
          fill
          priority={priority}
          sizes="64px"
          src="/brand/nexbail-monogram.png"
        />
      </span>
    );
  }

  const lightLogo = (
    <Image
      alt={alt}
      className="object-contain"
      fill
      priority={priority}
      sizes="(max-width: 640px) 104px, 200px"
      src="/brand/nexbail-logo-light.png"
    />
  );
  const darkLogo = (
    <Image
      alt={alt}
      className="object-contain"
      fill
      priority={priority}
      sizes="(max-width: 640px) 104px, 200px"
      src="/brand/nexbail-logo-dark.png"
    />
  );

  return (
    <span className={`relative block shrink-0 ${className}`}>
      {tone === "light" ? lightLogo : tone === "dark" ? darkLogo : (
        <>
          <span className="nexbail-brand-light absolute inset-0">{lightLogo}</span>
          <span className="nexbail-brand-dark absolute inset-0">{darkLogo}</span>
        </>
      )}
    </span>
  );
}
