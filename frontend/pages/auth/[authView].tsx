import { AuthView, authViewPaths } from "@daveyplate/better-auth-ui";
import type { GetStaticPaths, GetStaticProps } from "next";
import Image from "next/image";
import { Box, Container } from "@mui/material";

/**
 * Custom view path overrides matching AuthUIProvider's viewPaths config.
 * These must stay in sync with the viewPaths in _app.tsx.
 */
const customViewPaths: Partial<typeof authViewPaths> = {
  SIGN_IN: "login",
  SIGN_UP: "register",
};

/** Merged paths used for static generation. */
const mergedPaths = { ...authViewPaths, ...customViewPaths };

interface AuthPageProps {
  path: string;
}

export default function AuthPage({ path }: AuthPageProps) {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: "background.default",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        py: 6,
      }}
    >
      <Container maxWidth="sm">
        <Box sx={{ display: "flex", justifyContent: "center", mb: 4 }}>
          <Image
            src="/Logo PMSync.svg"
            alt="PMSync logo"
            width={150}
            height={150}
            priority
          />
        </Box>

        <AuthView path={path} />
      </Container>
    </Box>
  );
}

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: Object.values(mergedPaths).map((p) => ({
    params: { authView: p },
  })),
  fallback: false,
});

export const getStaticProps: GetStaticProps<AuthPageProps> = async ({
  params,
}) => ({
  props: { path: params?.authView as string },
});
