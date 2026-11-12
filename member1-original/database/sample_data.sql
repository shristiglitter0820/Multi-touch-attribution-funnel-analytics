--
-- PostgreSQL database dump
--

\restrict MpcRxyODNdhyj7JzkRQjLaF5DnjzxubXPl3N3re9w7pTpfmKPFhErbG5RjnRdIE

-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: app_role; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.app_role OVERRIDING SYSTEM VALUE VALUES (1, 'ADVERTISER');
INSERT INTO public.app_role OVERRIDING SYSTEM VALUE VALUES (2, 'ANALYST');


--
-- Data for Name: app_user; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.app_user OVERRIDING SYSTEM VALUE VALUES (1, 1, 'advertiser@example.com', '2026-10-26 12:06:43.258358');
INSERT INTO public.app_user OVERRIDING SYSTEM VALUE VALUES (2, 2, 'analyst@example.com', '2026-10-26 12:06:43.258358');
INSERT INTO public.app_user OVERRIDING SYSTEM VALUE VALUES (3, 2, 'customer1@example.com', '2026-10-26 12:06:43.258358');
INSERT INTO public.app_user OVERRIDING SYSTEM VALUE VALUES (4, 2, 'customer2@example.com', '2026-10-26 12:06:43.258358');


--
-- Data for Name: advertiser; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.advertiser OVERRIDING SYSTEM VALUE VALUES (1, 1, 'Demo Digital Marketing');


--
-- Data for Name: campaign; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.campaign OVERRIDING SYSTEM VALUE VALUES (1, 1, 'Summer Sale Campaign', 50000.00, '2026-10-01', '2026-11-30', 'ACTIVE');
INSERT INTO public.campaign OVERRIDING SYSTEM VALUE VALUES (2, 1, 'Festive Instagram Campaign', 30000.00, '2026-10-01', '2026-11-30', 'ACTIVE');


--
-- Data for Name: channel; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.channel OVERRIDING SYSTEM VALUE VALUES (1, 'Google Ads');
INSERT INTO public.channel OVERRIDING SYSTEM VALUE VALUES (2, 'Instagram');
INSERT INTO public.channel OVERRIDING SYSTEM VALUE VALUES (3, 'Facebook');
INSERT INTO public.channel OVERRIDING SYSTEM VALUE VALUES (4, 'Direct');


--
-- Data for Name: ad; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.ad OVERRIDING SYSTEM VALUE VALUES (1, 1, 1, 'Google Search Ad');
INSERT INTO public.ad OVERRIDING SYSTEM VALUE VALUES (2, 1, 2, 'Instagram Summer Ad');
INSERT INTO public.ad OVERRIDING SYSTEM VALUE VALUES (3, 2, 2, 'Festive Instagram Story');
INSERT INTO public.ad OVERRIDING SYSTEM VALUE VALUES (4, 2, 3, 'Festive Facebook Ad');


--
-- Data for Name: user_session; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.user_session OVERRIDING SYSTEM VALUE VALUES (1, 3, '2026-10-20 10:00:00', '2026-10-20 10:15:00', 'Mobile');
INSERT INTO public.user_session OVERRIDING SYSTEM VALUE VALUES (2, 3, '2026-10-22 14:00:00', '2026-10-22 14:20:00', 'Desktop');
INSERT INTO public.user_session OVERRIDING SYSTEM VALUE VALUES (3, 3, '2026-10-23 16:00:00', '2026-10-23 16:30:00', 'Mobile');
INSERT INTO public.user_session OVERRIDING SYSTEM VALUE VALUES (4, 4, '2026-10-24 11:00:00', '2026-10-24 11:25:00', 'Mobile');


--
-- Data for Name: ad_interaction; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.ad_interaction OVERRIDING SYSTEM VALUE VALUES (1, 3, 1, 1, 1, 'IMPRESSION', '2026-10-20 10:02:00', 'evt001');
INSERT INTO public.ad_interaction OVERRIDING SYSTEM VALUE VALUES (2, 3, 2, 2, 2, 'CLICK', '2026-10-22 14:05:00', 'evt002');
INSERT INTO public.ad_interaction OVERRIDING SYSTEM VALUE VALUES (3, 3, 3, NULL, 4, 'VISIT', '2026-10-23 16:05:00', 'evt003');
INSERT INTO public.ad_interaction OVERRIDING SYSTEM VALUE VALUES (4, 3, 3, NULL, 4, 'ADD_TO_CART', '2026-10-23 16:10:00', 'evt004');
INSERT INTO public.ad_interaction OVERRIDING SYSTEM VALUE VALUES (5, 4, 4, 4, 3, 'CLICK', '2026-10-24 11:05:00', 'evt005');
INSERT INTO public.ad_interaction OVERRIDING SYSTEM VALUE VALUES (6, 3, NULL, 2, 2, 'CLICK', '2026-10-29 09:31:58.007', '6ae2c53654adba579ee64892');
INSERT INTO public.ad_interaction OVERRIDING SYSTEM VALUE VALUES (7, 3, NULL, 1, 1, 'IMPRESSION', '2026-10-29 09:32:17.831', '6ae2c54954adba579ee64893');
INSERT INTO public.ad_interaction OVERRIDING SYSTEM VALUE VALUES (8, 3, NULL, 2, 2, 'CLICK', '2026-10-29 09:34:37.256', '6ae2c5d554adba579ee64894');


--
-- Data for Name: conversion; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.conversion OVERRIDING SYSTEM VALUE VALUES (1, 3, 3, '2026-10-23 16:20:00', 5000.00, 'ORD1001');
INSERT INTO public.conversion OVERRIDING SYSTEM VALUE VALUES (2, 4, 4, '2026-10-24 11:20:00', 2500.00, 'ORD1002');
INSERT INTO public.conversion OVERRIDING SYSTEM VALUE VALUES (3, 3, 3, '2026-10-31 09:57:54.105', 750.00, 'ORD1003');


--
-- Data for Name: attribution; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.attribution OVERRIDING SYSTEM VALUE VALUES (1, 1, 1, 'FIRST_TOUCH', 1.000000, 5000.00);
INSERT INTO public.attribution OVERRIDING SYSTEM VALUE VALUES (2, 2, 5, 'FIRST_TOUCH', 1.000000, 2500.00);
INSERT INTO public.attribution OVERRIDING SYSTEM VALUE VALUES (3, 1, 2, 'LAST_TOUCH', 1.000000, 5000.00);
INSERT INTO public.attribution OVERRIDING SYSTEM VALUE VALUES (4, 2, 5, 'LAST_TOUCH', 1.000000, 2500.00);
INSERT INTO public.attribution OVERRIDING SYSTEM VALUE VALUES (5, 1, 1, 'LINEAR', 0.500000, 2500.00);
INSERT INTO public.attribution OVERRIDING SYSTEM VALUE VALUES (6, 1, 2, 'LINEAR', 0.500000, 2500.00);
INSERT INTO public.attribution OVERRIDING SYSTEM VALUE VALUES (7, 2, 5, 'LINEAR', 1.000000, 2500.00);
INSERT INTO public.attribution OVERRIDING SYSTEM VALUE VALUES (8, 3, 1, 'FIRST_TOUCH', 1.000000, 750.00);
INSERT INTO public.attribution OVERRIDING SYSTEM VALUE VALUES (9, 3, 8, 'LAST_TOUCH', 1.000000, 750.00);
INSERT INTO public.attribution OVERRIDING SYSTEM VALUE VALUES (10, 3, 1, 'LINEAR', 0.200000, 150.00);
INSERT INTO public.attribution OVERRIDING SYSTEM VALUE VALUES (11, 3, 2, 'LINEAR', 0.200000, 150.00);
INSERT INTO public.attribution OVERRIDING SYSTEM VALUE VALUES (12, 3, 6, 'LINEAR', 0.200000, 150.00);
INSERT INTO public.attribution OVERRIDING SYSTEM VALUE VALUES (13, 3, 7, 'LINEAR', 0.200000, 150.00);
INSERT INTO public.attribution OVERRIDING SYSTEM VALUE VALUES (14, 3, 8, 'LINEAR', 0.200000, 150.00);


--
-- Data for Name: campaign_spend; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.campaign_spend OVERRIDING SYSTEM VALUE VALUES (1, 1, '2026-10-20', 1200.00);
INSERT INTO public.campaign_spend OVERRIDING SYSTEM VALUE VALUES (2, 1, '2026-10-22', 1800.00);
INSERT INTO public.campaign_spend OVERRIDING SYSTEM VALUE VALUES (3, 2, '2026-10-24', 1000.00);


--
-- Name: ad_ad_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.ad_ad_id_seq', 4, true);


--
-- Name: ad_interaction_interaction_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.ad_interaction_interaction_id_seq', 8, true);


--
-- Name: advertiser_advertiser_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.advertiser_advertiser_id_seq', 1, true);


--
-- Name: app_role_role_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.app_role_role_id_seq', 2, true);


--
-- Name: app_user_user_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.app_user_user_id_seq', 4, true);


--
-- Name: attribution_attribution_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.attribution_attribution_id_seq', 14, true);


--
-- Name: campaign_campaign_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.campaign_campaign_id_seq', 2, true);


--
-- Name: campaign_spend_spend_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.campaign_spend_spend_id_seq', 3, true);


--
-- Name: channel_channel_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.channel_channel_id_seq', 4, true);


--
-- Name: conversion_conversion_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.conversion_conversion_id_seq', 4, true);


--
-- Name: user_session_session_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.user_session_session_id_seq', 4, true);


--
-- PostgreSQL database dump complete
--

\unrestrict MpcRxyODNdhyj7JzkRQjLaF5DnjzxubXPl3N3re9w7pTpfmKPFhErbG5RjnRdIE
