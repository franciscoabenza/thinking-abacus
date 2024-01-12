src/pages/Index.jsx
```jsx
import { 
  Box, 
  Flex, 
  Text, 
  Button, 
  IconButton, 
  Image, 
  useColorModeValue, 
  Link, 
  Container, 
  Heading, 
  Stack, 
  Spacer 
} from '@chakra-ui/react';
import { FaSearch, FaTwitter, FaLinkedin, FaFacebookF } from 'react-icons/fa';

const Index = () => {
  const bgGradient = useColorModeValue(
    'linear(to-br, blackAlpha.900, purple.900)',
    'linear(to-br, blackAlpha.900, purple.900)'
  );

  const neonBlue = '#4d4dff';

  return (
    <Box bgGradient={bgGradient} color="white" minH="100vh">
      {/* Navigation Bar */}
      <Flex as="header" p={4} justifyContent="space-between" alignItems="center">
        <Heading as="h1" size="lg" letterSpacing="tighter">
          Thinking Abacus
        </Heading>
        <Spacer />
        <Stack as="nav" direction="row" spacing={8} align="center">
          <NavLink label="Why" />
          <NavLink label="Who" />
          <NavLink label="Services" />
          <NavLink label="Roadmap" />
          <NavLink label="Whitepaper" />
        </Stack>
        <Spacer />
        <Stack direction="row" spacing={2} align="center">
          <IconButton icon={<FaSearch />} variant="ghost" aria-label="Search" />
          <IconButton icon={<FaTwitter />} variant="ghost" aria-label="Twitter" />
          <IconButton icon={<FaLinkedin />} variant="ghost" aria-label="LinkedIn" />
          <IconButton icon={<FaFacebookF />} variant="ghost" aria-label="Facebook" />
        </Stack>
      </Flex>

      {/* Hero Section */}
      <Container maxW="container.md" textAlign="center" pt={20}>
        <Heading as="h2" size="2xl" mb={6}>
          Welcome to the Future of AI Consulting
        </Heading>
        <Text fontSize="lg" mb={6}>
          Unleash the true potential of your business with our cutting-edge AI strategies.
        </Text>
        <Stack direction="row" justify="center" spacing={4}>
          <Button 
            px={6} 
            py={3} 
            bg="transparent" 
            border="2px" 
            borderColor={neonBlue} 
            color={neonBlue} 
            _hover={{ bg: neonBlue, color: "black" }}
          >
            Get Started
          </Button>
          <Button 
            px={6} 
            py={3} 
            bg={neonBlue} 
            color="black" 
            _hover={{ bg: "transparent", color: neonBlue, borderColor: neonBlue }}
          >
            Book Meeting
          </Button>
        </Stack>
      </Container>

      {/* Background Pattern */}
      <Box position="absolute" top={0} left={0} height="100%" width="100%" opacity={0.1}>
        <Image src={getBackgroundImage()} alt="Abstract geometric pattern" />
      </Box>
    </Box>
  );
};

const NavLink = ({ label }) => (
  <Link px={3} py={2} rounded={'md'} _hover={{ textDecoration: 'none', bg: 'purple.700' }}>
    {label}
  </Link>
);

const getBackgroundImage = () => {
  // Placeholder for background image URL
  return "GPTENG:get_img('abstract geometric pattern')";
};

export default Index;
```

This code snippet creates a dark-themed front-end prototype for an AI consultancy website called 'Thinking Abacus'. The design incorporates a black and deep purple gradient background with neon blue accents for interactive elements like buttons. The navigation bar includes menu items and social media icons, and the hero section features bold typography with two call-to-action buttons. An abstract geometric pattern is included in the background to complement the dynamic theme of the website.
