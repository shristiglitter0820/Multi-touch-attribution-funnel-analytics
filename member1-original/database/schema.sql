--
-- PostgreSQL database dump
--

\restrict wK5K52pbeSqKhZdP8aGeSeRpbhygJtZHMjKcnn1xaadH5DntU0NgOpZY5JuLgDN

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

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ad; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ad (
    ad_id bigint NOT NULL,
    campaign_id bigint NOT NULL,
    channel_id integer NOT NULL,
    ad_name character varying(150) NOT NULL
);


ALTER TABLE public.ad OWNER TO postgres;

--
-- Name: ad_ad_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.ad ALTER COLUMN ad_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.ad_ad_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: ad_interaction; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ad_interaction (
    interaction_id bigint NOT NULL,
    user_id bigint NOT NULL,
    session_id bigint,
    ad_id bigint,
    channel_id integer NOT NULL,
    event_type character varying(20) NOT NULL,
    event_time timestamp without time zone NOT NULL,
    mongo_event_id character varying(100),
    CONSTRAINT ad_interaction_event_type_check CHECK (((event_type)::text = ANY ((ARRAY['IMPRESSION'::character varying, 'CLICK'::character varying, 'VISIT'::character varying, 'ADD_TO_CART'::character varying])::text[])))
);


ALTER TABLE public.ad_interaction OWNER TO postgres;

--
-- Name: ad_interaction_interaction_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.ad_interaction ALTER COLUMN interaction_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.ad_interaction_interaction_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: advertiser; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.advertiser (
    advertiser_id bigint NOT NULL,
    user_id bigint NOT NULL,
    company_name character varying(150) NOT NULL
);


ALTER TABLE public.advertiser OWNER TO postgres;

--
-- Name: advertiser_advertiser_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.advertiser ALTER COLUMN advertiser_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.advertiser_advertiser_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: app_role; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.app_role (
    role_id integer NOT NULL,
    role_name character varying(30) NOT NULL
);


ALTER TABLE public.app_role OWNER TO postgres;

--
-- Name: app_role_role_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.app_role ALTER COLUMN role_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.app_role_role_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: app_user; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.app_user (
    user_id bigint NOT NULL,
    role_id integer NOT NULL,
    email character varying(150) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.app_user OWNER TO postgres;

--
-- Name: app_user_user_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.app_user ALTER COLUMN user_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.app_user_user_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: attribution; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.attribution (
    attribution_id bigint NOT NULL,
    conversion_id bigint NOT NULL,
    interaction_id bigint NOT NULL,
    attribution_model character varying(20) NOT NULL,
    credit numeric(8,6) NOT NULL,
    attributed_revenue numeric(14,2) NOT NULL,
    CONSTRAINT attribution_attributed_revenue_check CHECK ((attributed_revenue >= (0)::numeric)),
    CONSTRAINT attribution_attribution_model_check CHECK (((attribution_model)::text = ANY ((ARRAY['FIRST_TOUCH'::character varying, 'LAST_TOUCH'::character varying, 'LINEAR'::character varying])::text[]))),
    CONSTRAINT attribution_credit_check CHECK (((credit >= (0)::numeric) AND (credit <= (1)::numeric)))
);


ALTER TABLE public.attribution OWNER TO postgres;

--
-- Name: attribution_attribution_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.attribution ALTER COLUMN attribution_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.attribution_attribution_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: campaign; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.campaign (
    campaign_id bigint NOT NULL,
    advertiser_id bigint NOT NULL,
    campaign_name character varying(150) NOT NULL,
    budget numeric(14,2) NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    status character varying(20) DEFAULT 'ACTIVE'::character varying NOT NULL,
    CONSTRAINT campaign_budget_check CHECK ((budget >= (0)::numeric)),
    CONSTRAINT campaign_check CHECK ((end_date >= start_date)),
    CONSTRAINT campaign_status_check CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'PAUSED'::character varying, 'COMPLETED'::character varying])::text[])))
);


ALTER TABLE public.campaign OWNER TO postgres;

--
-- Name: campaign_campaign_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.campaign ALTER COLUMN campaign_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.campaign_campaign_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: campaign_spend; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.campaign_spend (
    spend_id bigint NOT NULL,
    campaign_id bigint NOT NULL,
    spend_date date NOT NULL,
    amount numeric(14,2) NOT NULL,
    CONSTRAINT campaign_spend_amount_check CHECK ((amount >= (0)::numeric))
);


ALTER TABLE public.campaign_spend OWNER TO postgres;

--
-- Name: campaign_spend_spend_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.campaign_spend ALTER COLUMN spend_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.campaign_spend_spend_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: channel; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.channel (
    channel_id integer NOT NULL,
    channel_name character varying(50) NOT NULL
);


ALTER TABLE public.channel OWNER TO postgres;

--
-- Name: channel_channel_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.channel ALTER COLUMN channel_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.channel_channel_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: conversion; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.conversion (
    conversion_id bigint NOT NULL,
    user_id bigint NOT NULL,
    session_id bigint,
    conversion_time timestamp without time zone NOT NULL,
    revenue numeric(14,2) NOT NULL,
    order_reference character varying(100),
    CONSTRAINT conversion_revenue_check CHECK ((revenue >= (0)::numeric))
);


ALTER TABLE public.conversion OWNER TO postgres;

--
-- Name: conversion_conversion_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.conversion ALTER COLUMN conversion_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.conversion_conversion_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: user_session; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_session (
    session_id bigint NOT NULL,
    user_id bigint NOT NULL,
    started_at timestamp without time zone NOT NULL,
    ended_at timestamp without time zone,
    device_type character varying(30),
    CONSTRAINT user_session_check CHECK (((ended_at IS NULL) OR (ended_at >= started_at)))
);


ALTER TABLE public.user_session OWNER TO postgres;

--
-- Name: user_session_session_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.user_session ALTER COLUMN session_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.user_session_session_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: ad_interaction ad_interaction_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ad_interaction
    ADD CONSTRAINT ad_interaction_pkey PRIMARY KEY (interaction_id);


--
-- Name: ad ad_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ad
    ADD CONSTRAINT ad_pkey PRIMARY KEY (ad_id);


--
-- Name: advertiser advertiser_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.advertiser
    ADD CONSTRAINT advertiser_pkey PRIMARY KEY (advertiser_id);


--
-- Name: advertiser advertiser_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.advertiser
    ADD CONSTRAINT advertiser_user_id_key UNIQUE (user_id);


--
-- Name: app_role app_role_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.app_role
    ADD CONSTRAINT app_role_pkey PRIMARY KEY (role_id);


--
-- Name: app_role app_role_role_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.app_role
    ADD CONSTRAINT app_role_role_name_key UNIQUE (role_name);


--
-- Name: app_user app_user_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.app_user
    ADD CONSTRAINT app_user_email_key UNIQUE (email);


--
-- Name: app_user app_user_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.app_user
    ADD CONSTRAINT app_user_pkey PRIMARY KEY (user_id);


--
-- Name: attribution attribution_conversion_id_interaction_id_attribution_model_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attribution
    ADD CONSTRAINT attribution_conversion_id_interaction_id_attribution_model_key UNIQUE (conversion_id, interaction_id, attribution_model);


--
-- Name: attribution attribution_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attribution
    ADD CONSTRAINT attribution_pkey PRIMARY KEY (attribution_id);


--
-- Name: campaign campaign_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.campaign
    ADD CONSTRAINT campaign_pkey PRIMARY KEY (campaign_id);


--
-- Name: campaign_spend campaign_spend_campaign_id_spend_date_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.campaign_spend
    ADD CONSTRAINT campaign_spend_campaign_id_spend_date_key UNIQUE (campaign_id, spend_date);


--
-- Name: campaign_spend campaign_spend_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.campaign_spend
    ADD CONSTRAINT campaign_spend_pkey PRIMARY KEY (spend_id);


--
-- Name: channel channel_channel_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.channel
    ADD CONSTRAINT channel_channel_name_key UNIQUE (channel_name);


--
-- Name: channel channel_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.channel
    ADD CONSTRAINT channel_pkey PRIMARY KEY (channel_id);


--
-- Name: conversion conversion_order_reference_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.conversion
    ADD CONSTRAINT conversion_order_reference_key UNIQUE (order_reference);


--
-- Name: conversion conversion_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.conversion
    ADD CONSTRAINT conversion_pkey PRIMARY KEY (conversion_id);


--
-- Name: user_session user_session_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_session
    ADD CONSTRAINT user_session_pkey PRIMARY KEY (session_id);


--
-- Name: idx_attribution_conversion_model; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_attribution_conversion_model ON public.attribution USING btree (conversion_id, attribution_model);


--
-- Name: idx_campaign_spend_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_campaign_spend_date ON public.campaign_spend USING btree (campaign_id, spend_date);


--
-- Name: idx_conversion_user_time; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_conversion_user_time ON public.conversion USING btree (user_id, conversion_time);


--
-- Name: idx_interaction_ad; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_interaction_ad ON public.ad_interaction USING btree (ad_id);


--
-- Name: idx_interaction_session_time; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_interaction_session_time ON public.ad_interaction USING btree (session_id, event_time);


--
-- Name: idx_interaction_user_time; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_interaction_user_time ON public.ad_interaction USING btree (user_id, event_time);


--
-- Name: ad ad_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ad
    ADD CONSTRAINT ad_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaign(campaign_id);


--
-- Name: ad ad_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ad
    ADD CONSTRAINT ad_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.channel(channel_id);


--
-- Name: ad_interaction ad_interaction_ad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ad_interaction
    ADD CONSTRAINT ad_interaction_ad_id_fkey FOREIGN KEY (ad_id) REFERENCES public.ad(ad_id);


--
-- Name: ad_interaction ad_interaction_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ad_interaction
    ADD CONSTRAINT ad_interaction_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.channel(channel_id);


--
-- Name: ad_interaction ad_interaction_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ad_interaction
    ADD CONSTRAINT ad_interaction_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.user_session(session_id);


--
-- Name: ad_interaction ad_interaction_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ad_interaction
    ADD CONSTRAINT ad_interaction_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(user_id);


--
-- Name: advertiser advertiser_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.advertiser
    ADD CONSTRAINT advertiser_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(user_id);


--
-- Name: app_user app_user_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.app_user
    ADD CONSTRAINT app_user_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.app_role(role_id);


--
-- Name: attribution attribution_conversion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attribution
    ADD CONSTRAINT attribution_conversion_id_fkey FOREIGN KEY (conversion_id) REFERENCES public.conversion(conversion_id);


--
-- Name: attribution attribution_interaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attribution
    ADD CONSTRAINT attribution_interaction_id_fkey FOREIGN KEY (interaction_id) REFERENCES public.ad_interaction(interaction_id);


--
-- Name: campaign campaign_advertiser_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.campaign
    ADD CONSTRAINT campaign_advertiser_id_fkey FOREIGN KEY (advertiser_id) REFERENCES public.advertiser(advertiser_id);


--
-- Name: campaign_spend campaign_spend_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.campaign_spend
    ADD CONSTRAINT campaign_spend_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaign(campaign_id);


--
-- Name: conversion conversion_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.conversion
    ADD CONSTRAINT conversion_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.user_session(session_id);


--
-- Name: conversion conversion_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.conversion
    ADD CONSTRAINT conversion_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(user_id);


--
-- Name: user_session user_session_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_session
    ADD CONSTRAINT user_session_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(user_id);


--
-- PostgreSQL database dump complete
--

\unrestrict wK5K52pbeSqKhZdP8aGeSeRpbhygJtZHMjKcnn1xaadH5DntU0NgOpZY5JuLgDN
